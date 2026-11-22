# The HTTP envelope and body limits

The mediator itself knows nothing about HTTP. A separate entry point, `@garkpit/mediator/http`, has
three small helpers for the routes that sit in front of it:

- `ok` and `fail` build JSON responses in one fixed shape, so every client and every agent can tell
  success from failure the same way.
- `readBoundedBody` reads a request body but refuses one that is too large.

They use the standard `Request` and `Response` objects, so they work in Bun, SvelteKit, Hono, Deno and
any other runtime built on the Fetch API. They are kept out of the main entry point so a browser bundle
never pulls them in by accident.

## One shape for every response

Every response is one of two JSON shapes, called the **envelope**:

```json
{ "ok": true, "data": { "id": "n1", "title": "Shopping" } }
```

```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "Note n404 does not exist." } }
```

```ts
import { fail, ok } from '@garkpit/mediator/http';

// 200 with {"ok":true,"data":{...}}
const found = ok({ id: 'n1', title: 'Shopping' });

// Another success status, or extra headers
const created = ok({ id: 'n2' }, { status: 201, headers: { location: '/notes/n2' } });

// The status comes from the code: NOT_FOUND is 404
const missing = fail({ code: 'NOT_FOUND', message: 'Note n404 does not exist.' });

// `details` is yours: field errors, the key that was locked, anything the client can use
const invalid = fail({ code: 'VALIDATION_FAILED', message: 'Title is required.', details: { field: 'title' } });

console.log(found.status, created.status, missing.status, invalid.status); // 200 201 404 400
```

Both set `content-type: application/json` and an exact `content-length`.

### Error codes and statuses

`fail` looks the status up from the error code:

| Code | Status |
|---|---|
| `VALIDATION_FAILED` | 400 |
| `UNAUTHORIZED` | 401 |
| `NOT_FOUND` | 404 |
| `CONFLICT` | 409 |
| `MUTEX_HELD` | 409 |
| `PRECONDITION_FAILED` | 412 |
| `INTERNAL` | 500 |
| `UPSTREAM_FAILED` | 502 |
| anything else | 500 |

Add your own codes by extending the table and passing it in. Or set one status directly:

```ts
import { DEFAULT_STATUS_FOR_CODE, fail, statusForCode } from '@garkpit/mediator/http';

const STATUS_FOR_CODE = { ...DEFAULT_STATUS_FOR_CODE, PAYLOAD_TOO_LARGE: 413, RATE_LIMITED: 429 };

const tooBig = fail({ code: 'PAYLOAD_TOO_LARGE', message: 'That file is over the 2 MB limit.' }, { table: STATUS_FOR_CODE });
const teapot = fail({ code: 'INTERNAL', message: 'Short and stout.' }, { statusOverride: 418 });

console.log(tooBig.status, teapot.status, statusForCode('RATE_LIMITED', STATUS_FOR_CODE)); // 413 418 429
```

## A complete route

A route has three jobs: turn the HTTP request into a Command or Query, send it, and wrap what comes
back. Mapping errors to codes belongs in one function that every route shares.

<!-- check:prelude
import { Command, createMediator } from '@garkpit/mediator';
interface Note { id: string; title: string }
class RenameNote extends Command<Note> { constructor(readonly id: string, readonly title: string) { super(); } }
class NotFoundError extends Error {}
class ValidationError extends Error {}
const mediator = createMediator();
-->
```ts
import { MutexHeldError } from '@garkpit/mediator';
import { fail, ok, readBoundedBody, RequestBodyLimitError, type ApiErrorShape } from '@garkpit/mediator/http';

// One place that knows how errors become codes.
function toApiError(error: unknown): ApiErrorShape {
  if (error instanceof ValidationError) return { code: 'VALIDATION_FAILED', message: error.message };
  if (error instanceof NotFoundError) return { code: 'NOT_FOUND', message: error.message };
  if (error instanceof MutexHeldError) return { code: 'MUTEX_HELD', message: 'Someone else is changing this. Try again.' };
  if (error instanceof RequestBodyLimitError) return { code: 'VALIDATION_FAILED', message: error.message };
  return { code: 'INTERNAL', message: 'Something went wrong.' }; // never leak internals
}

// PATCH /notes/:id
export async function renameNoteRoute(request: Request, noteId: string, userId: string): Promise<Response> {
  try {
    const bytes = await readBoundedBody(request, 16 * 1024);
    const body = JSON.parse(new TextDecoder().decode(bytes)) as { title?: unknown };
    if (typeof body.title !== 'string' || body.title === '') throw new ValidationError('"title" must be a non-empty string.');

    const note = await mediator.send(new RenameNote(noteId, body.title), { actor: userId });
    return ok(note);
  } catch (error) {
    return fail(toApiError(error));
  }
}
```

In SvelteKit the same route is a `+server.ts` file. This is a sketch (it is not compiled by this
repository's checks, because the library does not depend on SvelteKit):

```ts nocheck
// src/routes/api/notes/[id]/+server.ts
import type { RequestHandler } from './$types';
import { fail, ok, readBoundedBody } from '@garkpit/mediator/http';
import { mediator } from '$lib/server/mediator';
import { toApiError } from '$lib/server/errors';
import { RenameNote } from '$lib/features/notes/rename-note/RenameNote';

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  try {
    const bytes = await readBoundedBody(request, 16 * 1024);
    const command = RenameNote.parse({ ...JSON.parse(new TextDecoder().decode(bytes)), id: params.id });
    return ok(await mediator.send(command, { actor: locals.user.id }));
  } catch (error) {
    return fail(toApiError(error));
  }
};
```

## Reading a body with a limit

`readBoundedBody(request, limit)` returns the body as bytes, and protects you from a client that sends
far more than you expect:

- If the request declares a `content-length` over the limit, it is refused before a single byte is
  read.
- If the body is streamed with no declared length, reading stops and the stream is cancelled the
  moment it passes the limit.
- A request with no body gives an empty array.

Either refusal throws `RequestBodyLimitError`, which carries the `limit` and, when the client declared
one, the `declared` size.

```ts
import { readBoundedBody, RequestBodyLimitError } from '@garkpit/mediator/http';

const request = new Request('https://example.test/upload', { method: 'POST', body: 'x'.repeat(5000) });

try {
  await readBoundedBody(request, 1024);
} catch (error) {
  if (error instanceof RequestBodyLimitError) {
    console.log(error.message, error.limit); // "Request body exceeds the 1024-byte limit." 1024
  }
}
```

## On the client

Because the shape never varies, one small function unwraps every call:

```ts
type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly details?: unknown) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = (await response.json()) as Envelope<T>;
  if (!body.ok) throw new ApiError(body.error.code, body.error.message, body.error.details);
  return body.data;
}
```

## Where next

- [Growing an app with vertical slices](vertical-slices.md): where routes, requests and handlers live.
- [`examples/notes`](../examples/notes/README.md): a runnable app whose routes all follow this page.
