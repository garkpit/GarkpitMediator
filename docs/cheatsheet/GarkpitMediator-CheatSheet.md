# GarkpitMediator cheat sheet

`@garkpit/mediator` 0.2.0. A zero-dependency CQRS mediator for TypeScript. Every feature is a named Command or Query with one handler, sent through one pipeline of behaviors.

## Install: copy it in

No npm package. Copy the source into your project and record the commit.

```sh
git clone https://github.com/garkpit/GarkpitMediator.git ../GarkpitMediator
mkdir -p packages/mediator
git -C ../GarkpitMediator archive HEAD src package.json tsconfig.json \
  LICENSE README.md llms-full.txt | tar -x -C packages/mediator
# package.json: "workspaces": ["packages/*"],
#   "dependencies": { "@garkpit/mediator": "workspace:*" }
bun install
```

## The whole shape

```ts
import { Command, Query, createMediator, LoggingBehavior, MutexBehavior } from '@garkpit/mediator';

// A Query reads.
class GetNote extends Query<Note | undefined> {
  constructor(readonly id: string) { super(); }
}

// A Command changes something. Methods opt it in to the lock and the audit trail.
class RenameNote extends Command<Note> {
  constructor(readonly id: string, readonly title: string) { super(); }
  mutexKey() { return `note:${this.id}`; }
  auditInfo() { return { action: 'note.rename', resourceId: this.id, details: { title: this.title } }; }
}

// Behaviors wrap every request, outermost first. One handler per request class.
const mediator = createMediator({ behaviors: [new MutexBehavior(), audit, new LoggingBehavior()] });
mediator.register(GetNote, { handle: async (query) => notes.get(query.id) });
mediator.register(RenameNote, new RenameNoteHandler(store));

// Send from anywhere. The result is typed: here, a Note.
const note = await mediator.send(new RenameNote('n1', 'Weekly shop'), { actor: 'priya' });
```

## Core API

| | |
|---|---|
| `Command` | Base class for a request that changes something. Result type defaults to void. |
| `Query` | Base class for a request that only reads. |
| `Handler` | An object with handle(request): Promise<Result>. |
| `createMediator` | Builds a Mediator with the given behaviors, outermost first. |
| `Mediator` | register(Class, handler), send(request, ctx), use(behavior), registeredRequestTypes(). |
| `RequestContext` | { actor, correlationId?, audit?, secrets? }: who is asking. Goes to behaviors, not handlers. |
| `MediatorPort` | The three-method interface to depend on in library code. |
| `PipelineBehavior` | invoke(request, next, ctx): your own step around every request. |

## Built-in behaviors

| | |
|---|---|
| `MutexBehavior` | Request has mutexKey(): string \| string[]. One at a time per key, all-or-nothing, fails fast with MutexHeldError. In-process only. |
| `AuditBehavior` | Request has auditInfo(). One row per request, ok or fail, secrets redacted. Needs appendEntry and mapError. A failed write never changes the result. |
| `LoggingBehavior` | Every request. One line: [mediator] Name ok (1.2ms). Pass a sink to redirect. |

- Order is outermost first. With `[mutex, audit, logging]` a command refused by the lock leaves no audit row; put audit first to record refusals.

## HTTP envelope

From @garkpit/mediator/http. Standard Request and Response objects.

```ts
import { fail, ok, readBoundedBody }
  from '@garkpit/mediator/http';

ok(note);                // 200 {"ok":true,"data":…}
ok(note, { status: 201 });
fail({ code: 'NOT_FOUND', message: 'No such note.' });
                         // 404 {"ok":false,"error":…}
fail(error, { table: MY_STATUS_TABLE });
await readBoundedBody(request, 16 * 1024);
                         // or RequestBodyLimitError
```

- `VALIDATION_FAILED` 400 · `UNAUTHORIZED` 401 · `NOT_FOUND` 404 · `CONFLICT` 409 · `MUTEX_HELD` 409 · `PRECONDITION_FAILED` 412 · `INTERNAL` 500 · `UPSTREAM_FAILED` 502 · unknown 500

## Recipe: add a feature

- New folder `src/features/<area>/<verb-noun>/` with `VerbNoun.ts` (the request), `VerbNounHandler.ts` and `VerbNoun.test.ts`.
- One line in the area's `index.ts`: `mediator.register(VerbNoun, new VerbNounHandler(deps))`.
- A thin route: parse the input, `mediator.send(request, { actor })`, then `ok(data)` or `fail(error)`.
- Needs a lock? Add `mutexKey()`. Needs a record? Add `auditInfo()`. Nothing else changes.
- Using an agent catalogue? Add its entry; the parity test fails until you do.

## Recipe: your own behavior

```ts
class PermissionBehavior implements PipelineBehavior {
  async invoke<T extends Request<R>, R>(
    request: T, next: Next<R>, ctx?: RequestContext
  ): Promise<R> {
    // Throw to stop here: the handler never runs.
    if (!(await allowed(request, ctx))) {
      throw new ForbiddenError();
    }
    // Or carry on down the pipeline.
    return next();
  }
}
```

- Write behaviors as classes: each class may be used once per mediator, and they are told apart by class name.

## Recipe: an agent tool catalogue

```ts
// One entry per request. This test keeps it honest:
expect(catalogue.map((tool) => tool.name).sort())
  .toEqual([...mediator.registeredRequestTypes()]);

// Record how a request arrived:
mediator.send(request, {
  actor,
  audit: { via: 'assistant-chat', proposalId }
});
```

- Queries run at once; Commands become proposals a person confirms. See the agentic interface guide.

## Gotchas

- Handlers are keyed by **class name**. Names must be unique per mediator, and a server bundle must keep them: `bun build --minify --keep-names`, esbuild `keepNames`, Terser `keep_classnames`.
- The lock lives in one process. Build one `MutexBehavior` and reuse it. It does not coordinate across servers.
- Hot reload re-runs registrations: pass `{ allowReplace: true }` to `register` and `use` in development only.
- Handlers do not receive the context. Put what they need (an owner id) on the request.
- Sharing request classes with browser code? Import from `@garkpit/mediator/Request`, which has no imports.
- The exported `Request` class hides the Fetch API's if imported by name. Extend `Command` or `Query`, or alias it.
- A handler that sends another locked command on the same key gets `MutexHeldError`. Declare every key up front with an array.

## In this repository

| | |
|---|---|
| `bun run check` | Typecheck, unit tests, example tests, docs check, cheat-sheet drift. |
| `bun run example` | A narrated tour of examples/notes: HTTP, chat and MCP doors on one pipeline. |
| `bun run docs` | Regenerate llms.txt, llms-full.txt and the diagrams. |
| `bun run cheatsheet` | Regenerate this sheet (Markdown, HTML, PDF). |
| `bun run site` | Build the documentation site into dist/site; site:serve previews it. |

## Read more

- [Getting started](../getting-started.md)
- [Commands and Queries](../commands-and-queries.md)
- [Behaviors](../behaviors.md)
- [HTTP envelope](../http.md)
- [Vertical slices](../vertical-slices.md)
- [AI coding agents](../ai-coding-agents.md)
- [Agentic interface](../agentic-interface.md)
- [API reference](../api-reference.md)
- [FAQ](../faq.md)

Source: https://github.com/garkpit/GarkpitMediator
