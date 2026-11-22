# @garkpit/mediator

A small CQRS mediator for TypeScript web apps: every request is a `Command` (a mutation) or a `Query`
(a read), dispatched with `mediator.send(request, ctx)` to the one handler registered for its class,
through an ordered pipeline of behaviors (mutex, audit, logging, or your own). It also ships the
two-shape JSON route envelope (`ok` / `fail`) and a bounded request-body reader.

Zero runtime dependencies. Source-only TypeScript (exports point at `src/*.ts`); runs on Bun and on
any bundler that compiles TypeScript.

## Quick start

```ts
import { Command, Query, createMediator, MutexBehavior, AuditBehavior, LoggingBehavior } from '@garkpit/mediator';

class GetNote extends Query<Note> { constructor(readonly id: string) { super(); } }
class RenameNote extends Command<Note> {
  constructor(readonly id: string, readonly title: string) { super(); }
  mutexKey() { return `note:${this.id}`; }                                        // HasMutexKey
  auditInfo() { return { action: 'note.rename', resourceId: this.id, details: { title: this.title } }; } // HasAuditInfo
}

// Stateful behaviors are built once per process and reused (see "Process-scoped state").
const mutex = new MutexBehavior();
const audit = new AuditBehavior({ appendEntry: async (entry) => db.insertAudit(entry), mapError: (e) => ({ code: codeFor(e) }) });

export const mediator = createMediator({ behaviors: [mutex, audit, new LoggingBehavior()] });
mediator.register(GetNote, { handle: async (q) => notes.get(q.id) });
mediator.register(RenameNote, { handle: async (c) => notes.rename(c.id, c.title) });

const note = await mediator.send(new RenameNote('n1', 'New title'), { actor: 'alice' });
```

## Public surface

`@garkpit/mediator` (the root) exports everything below. The subpaths in `package.json` (`./Mediator`,
`./http`, `./behaviors/AuditBehavior`, …) expose single files for consumers that re-export them one by
one; they are the same objects.

| Export | What it is |
|---|---|
| `Request<R>`, `Command<R>`, `Query<R>` | Base classes. `R` is the response type; `Command` defaults to `void`. |
| `Handler<TRequest, R>`, `RequestConstructor<T>` | `{ handle(request): Promise<R> }`, and the class type `register` takes. |
| `Mediator` | `register(ctor, handler, { allowReplace? })`, `use(behavior, { allowReplace? })`, `send(request, ctx?)`, `registeredRequestTypes()`. |
| `createMediator({ behaviors })` | A `Mediator` with the given behaviors installed, outermost first. |
| `MediatorPort` | The structural surface a library needs from a host's mediator: `register`, `registeredRequestTypes`, `send`. Depend on this type, not on the class, when your library should work with any mediator of that shape. |
| `RequestContext` | `{ actor, correlationId?, audit?, secrets? }`, threaded to every behavior. `audit` adds per-send key/values to the audit row's details without overwriting the command's own; `secrets` are values the audit row must never contain (replaced with `[REDACTED]` in details and the error message). |
| `PipelineBehavior`, `Next<R>` | `invoke(request, next, ctx?)`. Call `next()` to continue; throw or return to short-circuit. |
| `MutexBehavior`, `HasMutexKey`, `isMutexed`, `MutexHeldError` | In-process, all-or-nothing locking on the keys a command declares (sorted acquisition; released on every exit path). A held key fails fast with `MutexHeldError`. |
| `AuditBehavior<TInfo>`, `AuditBehaviorOptions`, `AuditWriter`, `AuditLogWriter`, `AuditErrorMapper`, `AuditFailureReporter`, `SecretsRedactor`, `auditEntryToLogEntry` | One audit row per `HasAuditInfo` request, ok or fail, redacted, written without ever changing the command's result. Writers receive `(entry, info)`. |
| `AuditInfo`, `HasAuditInfo<TInfo>`, `isAuditable`, `AuditEntry`, `AuditOutcome` | What a command reports, and the row the behavior builds. |
| `LogEntry`, `LogLevel`, `LogEventType`, `LogOutcome`, `LogErrorDetails`, `LOG_LEVELS`, `LOG_EVENT_TYPES` | The generic log shape an audit row can be mirrored into (`appendLogEntry` + `logSource`). |
| `LoggingBehavior`, `MediatorLogSink` | One line per request (`[mediator] Name ok (1.2ms)`), to `console.log` unless you pass a sink. |
| `redactSecrets` | Replaces values under secret-looking keys (`token`, `password`, `api_key`, `authorization`, `cookie`, …) with `[REDACTED]`, four levels deep. |
| `HandlerNotRegisteredError`, `HandlerAlreadyRegisteredError`, `BehaviorAlreadyRegisteredError` | Registration and dispatch errors. |

`@garkpit/mediator/http` (not re-exported from the root, so a browser bundle never pulls it in by accident):

| Export | What it is |
|---|---|
| `ok(data, { status?, headers? })` | `{"ok":true,"data":…}`, JSON, explicit content-length. |
| `fail({ code, message, details? }, { statusOverride?, table? })` | `{"ok":false,"error":{…}}` with the status from the code. |
| `ApiErrorShape<Code>`, `OkInit` | The error body and `ok`'s options. |
| `DEFAULT_STATUS_FOR_CODE`, `statusForCode(code, table?)` | `VALIDATION_FAILED` 400, `UNAUTHORIZED` 401, `NOT_FOUND` 404, `CONFLICT`/`MUTEX_HELD` 409, `PRECONDITION_FAILED` 412, `INTERNAL` 500, `UPSTREAM_FAILED` 502; unknown codes 500. Extend the table with your own codes. |
| `readBoundedBody(request, limit)`, `RequestBodyLimitError` | Reads a body up to `limit` bytes: a declared content-length over the limit is refused before reading, a stream is cancelled the moment it passes it. |

## Things to know

- **Handlers and behaviors are keyed by class name** (`constructor.name`), not class identity. That is
  what lets Vite's SSR hot reload redefine a request class and still reach its handler. Two consequences:
  request class names must be unique within one mediator, and **a minifier that renames classes breaks
  dispatch silently**. Keep class names in server bundles (esbuild/Bun `keepNames`, Terser
  `keep_classnames`), or do not minify server code.
- **Process-scoped state**: `MutexBehavior` holds its locks in memory, per instance and per process.
  Build it once at module scope and pass the same instance to every mediator you create; it does not
  coordinate across processes or machines.
- **App-specific audit dimensions** (a tenant, an instance) are not fields of `AuditInfo` or
  `AuditEntry`. Extend `AuditInfo` in the app, type the behavior with it (`new AuditBehavior<AppAuditInfo>(…)`),
  and add the fields in your writer, which receives the request's info next to the entry. Your app's
  log sources, log and audit query filters and paging are app code too.
- **`allowReplace`** is for dev-mode hot reload only. In production a duplicate registration throws.
- The audit and log writers are awaited but isolated: a writer that throws is reported
  (`console.error` unless you pass `reportFailure`) and the command's result or error is unchanged.

## Using it

There is no npm package. Copy this repository into your project as a synced export
(for example `packages/mediator`) with a `SOURCE.md` beside it that records the commit you took, and
depend on it as a workspace package:

```sh
git -C /path/to/GarkpitMediator archive <commit> | tar -x -C packages/mediator
```

## Develop

```sh
bun install
bun run check      # typecheck, then unit tests: dispatch, pipeline, behaviors, envelope, body limit
```

## Disclaimer

A small personal project, shared as is under the [MIT licence](LICENSE): no warranty, no support and
no promise of stability between versions. It is not a product of, or endorsed by, any employer. Issues
and pull requests may go unanswered.
