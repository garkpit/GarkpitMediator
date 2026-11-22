// The HTTP door. Each route does three things and nothing else: turn the request into a Command or
// Query, send it, and wrap the outcome in the ok/fail envelope. No route touches the store.
import type { RequestContext } from '@garkpit/mediator';
import { fail, ok, readBoundedBody } from '@garkpit/mediator/http';
import { catalogue } from '../agent/catalogue';
import { handleMcpMessage } from '../agent/mcp';
import type { App } from '../app';
import { STATUS_FOR_CODE, toApiError, ValidationError } from '../errors';
import { CreateNote, GetNote, ListNotes, RenameNote } from '../features/notes';

/** The largest request body any route accepts. */
export const BODY_LIMIT_BYTES = 16 * 1024;

async function readJson(request: Request): Promise<unknown> {
  const bytes = await readBoundedBody(request, BODY_LIMIT_BYTES);
  if (bytes.byteLength === 0) return {};
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ValidationError('The request body is not valid JSON.');
  }
}

export function createRoutes(app: App): (request: Request) => Promise<Response> {
  const { mediator } = app;

  return async (request) => {
    const url = new URL(request.url);
    const noteId = /^\/notes\/([^/]+)$/.exec(url.pathname)?.[1];
    // A demo stand-in for sign-in: a real app takes the actor from its session, never from a header.
    const ctx: RequestContext = { actor: request.headers.get('x-actor') ?? 'anonymous', correlationId: crypto.randomUUID() };

    try {
      if (request.method === 'GET' && url.pathname === '/notes') {
        return ok(await mediator.send(new ListNotes(), ctx));
      }
      if (request.method === 'POST' && url.pathname === '/notes') {
        return ok(await mediator.send(CreateNote.parse(await readJson(request)), ctx), { status: 201 });
      }
      if (request.method === 'GET' && noteId) {
        return ok(await mediator.send(new GetNote(noteId), ctx));
      }
      if (request.method === 'PATCH' && noteId) {
        const body = await readJson(request);
        return ok(await mediator.send(RenameNote.parse({ ...(body as object), id: noteId }), ctx));
      }
      if (request.method === 'GET' && url.pathname === '/capabilities') {
        // The app describing itself: every registered request, with the catalogue's words for it.
        return ok(mediator.registeredRequestTypes().map((name) => {
          const tool = catalogue.find((t) => t.name === name);
          return { name, kind: tool?.kind, description: tool?.description };
        }));
      }
      if (request.method === 'POST' && url.pathname === '/mcp') {
        const reply = await handleMcpMessage(app, await readJson(request), ctx);
        return reply === null ? new Response(null, { status: 202 }) : Response.json(reply);
      }
      return fail({ code: 'NOT_FOUND', message: `No route for ${request.method} ${url.pathname}.` });
    } catch (error) {
      return fail(toApiError(error), { table: STATUS_FOR_CODE });
    }
  };
}
