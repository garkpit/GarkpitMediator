# API reference

Everything the library exports, grouped by what you use it for. There are two entry points:

- `@garkpit/mediator`: requests, the mediator, behaviors and their types.
- `@garkpit/mediator/http`: the JSON envelope and the bounded body reader. Kept separate so browser
  code never pulls it in by accident.

This page is checked against the source on every `bun run check`: every exported name must appear here,
and every heading here must be a real export.

## Requests and handlers

### `Request`

```ts nocheck
abstract class Request<TResponse = void>
```

The base of every request. `TResponse` is the type the handler returns, and what `send` resolves to.
You normally extend `Command` or `Query`, not this. If you import it by name alongside HTTP code,
rename it (`import type { Request as MediatorRequest }`) so it does not hide the Fetch API's `Request`.

### `Command`

```ts nocheck
abstract class Command<TResponse = void> extends Request<TResponse>
```

A request that changes something. The result type defaults to `void`.

### `Query`

```ts nocheck
abstract class Query<TResponse> extends Request<TResponse>
```

A request that only reads. The result type is required.

### `Handler`

```ts nocheck
interface Handler<TRequest extends Request<TResponse>, TResponse> {
  handle(request: TRequest): Promise<TResponse>;
}
```

The code that carries out one kind of request. Any object with a matching `handle` method will do.

### `RequestConstructor`

```ts nocheck
type RequestConstructor<T extends Request<unknown>> = new (...args: never[]) => T;
```

The type of a request class itself, as taken by `register`.

### `RequestContext`

```ts nocheck
interface RequestContext {
  actor: string;
  readonly correlationId?: string;
  readonly audit?: Readonly<Record<string, unknown>>;
  readonly secrets?: readonly string[];
}
```

Who is asking, passed as the second argument of `send` and handed to every behavior.

| Field | Meaning |
|---|---|
| `actor` | Who is making the request. `AuditBehavior` records it. |
| `correlationId` | Your id for tying the audit row to other logs. |
| `audit` | Extra key/values merged into this send's audit `details`. They never overwrite a key the command itself reports. |
| `secrets` | Strings that must not appear anywhere in this send's audit row. Each is replaced with `[REDACTED]` in the details (keys and values) and in the error message. Empty strings are ignored. |

## The mediator

### `createMediator`

```ts nocheck
function createMediator(options?: CreateMediatorOptions): Mediator
```

Builds a `Mediator` and installs `options.behaviors` in order, outermost first. It holds no state of its
own: build stateful behaviors once and pass the same instances in.

### `CreateMediatorOptions`

```ts nocheck
interface CreateMediatorOptions {
  behaviors?: readonly PipelineBehavior[];
}
```

### `Mediator`

```ts nocheck
class Mediator implements MediatorPort {
  register(ctor, handler, options?: RegisterOptions): void;
  use(behavior: PipelineBehavior, options?: RegisterOptions): void;
  send<TResponse>(request: Request<TResponse>, ctx?: RequestContext): Promise<TResponse>;
  registeredRequestTypes(): readonly string[];
}
```

| Method | What it does |
|---|---|
| `register(ctor, handler, options?)` | Registers the one handler for a request class, keyed by the class name. A second registration for the same name throws `HandlerAlreadyRegisteredError` unless `options.allowReplace` is true. |
| `use(behavior, options?)` | Appends a behavior to the pipeline (the first added is outermost). Each behavior class may be used once; a second throws `BehaviorAlreadyRegisteredError` unless `allowReplace` is true, in which case the new instance takes the old one's place in the order. |
| `send(request, ctx?)` | Runs the request through every behavior to its handler and returns the handler's result. Throws `HandlerNotRegisteredError` if no handler is registered. A handler's error reaches the caller unchanged. |
| `registeredRequestTypes()` | The names of every request class with a handler, sorted, as a new array each call. |

### `RegisterOptions`

```ts nocheck
interface RegisterOptions {
  allowReplace?: boolean;
}
```

`allowReplace: true` lets a registration replace an existing one of the same name. It exists for
development servers that re-run registration code on hot reload. Leave it off in production.

### `MediatorPort`

```ts nocheck
interface MediatorPort {
  register(ctor, handler, options?: RegisterOptions): void;
  registeredRequestTypes(): readonly string[];
  send<TResponse>(request: Request<TResponse>, ctx?: RequestContext): Promise<TResponse>;
}
```

The three methods a library needs from a host app's mediator. Depend on this type (not on the
`Mediator` class) in code that should work with any mediator of the same shape. `Mediator` implements
it.

### `HandlerNotRegisteredError`

Thrown by `send` when no handler is registered for the request's class name. `requestName` holds the
name.

### `HandlerAlreadyRegisteredError`

Thrown by `register` on a duplicate class name. `requestName` holds the name.

### `BehaviorAlreadyRegisteredError`

Thrown by `use` when a behavior of the same class is already installed. `behaviorName` holds the name.

## The pipeline

### `PipelineBehavior`

```ts nocheck
interface PipelineBehavior {
  invoke<TRequest extends Request<TResponse>, TResponse>(
    request: TRequest,
    next: Next<TResponse>,
    ctx?: RequestContext
  ): Promise<TResponse>;
}
```

A step that wraps every request. Call `next()` to continue; return or throw without calling it to stop
the request before the handler.

### `Next`

```ts nocheck
type Next<TResponse> = () => Promise<TResponse>;
```

The rest of the pipeline, as seen from inside a behavior.

## Locking

### `MutexBehavior`

```ts nocheck
class MutexBehavior implements PipelineBehavior
```

Takes the keys a request declares with `mutexKey()` for the length of the request. All keys are taken
together or none; a held key throws `MutexHeldError` at once; keys are released on every exit. Locks
are held in memory, per instance, per process. No constructor arguments.

### `HasMutexKey`

```ts nocheck
interface HasMutexKey {
  mutexKey(): string | readonly string[];
}
```

Implemented by a request that needs a lock. Return one key or several.

### `isMutexed`

```ts nocheck
function isMutexed(req: unknown): req is HasMutexKey
```

True when the value has a `mutexKey` method.

### `MutexHeldError`

Thrown when a key is already held. `key` holds the key.

## Auditing

### `AuditBehavior`

```ts nocheck
class AuditBehavior<TInfo extends AuditInfo = AuditInfo> implements PipelineBehavior {
  constructor(options: AuditBehaviorOptions<TInfo>);
}
```

Writes one `AuditEntry` for each request that implements `HasAuditInfo`: outcome `'ok'` when the
handler returns, `'fail'` when it throws (the error is then rethrown unchanged). `auditInfo()` is read
after the handler has run. A request whose `details.columnsPatched` is an empty array is not recorded.

### `AuditBehaviorOptions`

| Option | Type | Meaning |
|---|---|---|
| `appendEntry` | `AuditWriter<TInfo>` | Required. Stores one row. Receives `(entry, info)`. |
| `mapError` | `AuditErrorMapper` | Required. Turns a thrown error into `{ code }` for the row. |
| `appendLogEntry` | `AuditLogWriter<TInfo>` | Optional. Also copies each row into a general log as a `LogEntry`. Needs `logSource`. |
| `logSource` | `string` | The `source` value for mirrored log entries. |
| `redactSecrets` | `SecretsRedactor` | Replaces the default redaction of `details`. |
| `defaultActor` | `string` | The actor recorded when `send` had no context. Default `'system'`. |
| `reportFailure` | `AuditFailureReporter` | Called when a writer throws. Default `console.error`. |

### `AuditWriter`

```ts nocheck
type AuditWriter<TInfo extends AuditInfo = AuditInfo> = (entry: AuditEntry, info: TInfo) => Promise<void>;
```

### `AuditLogWriter`

```ts nocheck
type AuditLogWriter<TInfo extends AuditInfo = AuditInfo> = (entry: LogEntry, info: TInfo) => Promise<void>;
```

### `AuditErrorMapper`

```ts nocheck
type AuditErrorMapper = (error: unknown) => { code: string };
```

### `SecretsRedactor`

```ts nocheck
type SecretsRedactor = (input: Record<string, unknown>) => Record<string, unknown>;
```

### `AuditFailureReporter`

```ts nocheck
type AuditFailureReporter = (message: string, context: Record<string, unknown>) => void;
```

### `AuditInfo`

```ts nocheck
interface AuditInfo {
  action: string;
  resourceId?: string;
  details: Record<string, unknown>;
}
```

What a request reports about itself. Extend it to add your own fields and read them in your writer.

### `HasAuditInfo`

```ts nocheck
interface HasAuditInfo<TInfo extends AuditInfo = AuditInfo> {
  auditInfo(): TInfo;
}
```

### `isAuditable`

```ts nocheck
function isAuditable(req: unknown): req is HasAuditInfo
```

True when the value has an `auditInfo` method.

### `AuditEntry`

```ts nocheck
interface AuditEntry {
  schemaVersion: 2;
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  outcome: AuditOutcome;
  details: Record<string, unknown>;
  error?: { code: string; message: string };
  correlationId?: string;
  commandName?: string;
  durationMs?: number;
  resourceId?: string;
}
```

The row `AuditBehavior` builds and hands to your writer.

### `AuditOutcome`

```ts nocheck
type AuditOutcome = 'ok' | 'fail' | 'denied';
```

`AuditBehavior` writes `'ok'` and `'fail'`. `'denied'` is there for rows your own code writes, for
example from a permission behavior.

### `auditEntryToLogEntry`

```ts nocheck
function auditEntryToLogEntry(entry: AuditEntry, source: string): LogEntry
```

Converts an audit row to the general log shape: level `info` for `ok`, `warn` otherwise; event type
`audit`; the audit id and resource id added to `details`.

### `redactSecrets`

```ts nocheck
function redactSecrets(input: Record<string, unknown>): Record<string, unknown>
```

Returns a copy in which every value under a secret-looking key is `[REDACTED]`. A key looks secret when
it contains `token`, `secret`, `password`, `api_key` (or `apikey`, `api-key`), `authorization`,
`cookie`, `jwt`, `bearer`, `private_key` or `signature`, in any letter case. It looks inside nested
objects and arrays to four levels.

## Logging

### `LoggingBehavior`

```ts nocheck
class LoggingBehavior implements PipelineBehavior {
  constructor(sink?: MediatorLogSink);
}
```

One line per request: `[mediator] Name ok (1.2ms)`, or `[mediator] Name FAIL (0.4ms):` with the error,
which is then rethrown. Writes to `console.log` unless you pass a sink.

### `MediatorLogSink`

```ts nocheck
type MediatorLogSink = (line: string, error?: unknown) => void;
```

### `LogEntry`

```ts nocheck
interface LogEntry {
  schemaVersion: 1;
  timestamp: string;
  level: LogLevel;
  source: string;
  eventType: LogEventType;
  event: string;
  component?: string;
  message?: string;
  actor?: string;
  userId?: string;
  requestId?: string;
  correlationId?: string;
  durationMs?: number;
  outcome?: LogOutcome;
  error?: LogErrorDetails;
  details?: Record<string, unknown>;
  raw?: string;
}
```

A general-purpose log record that an audit row can be mirrored into. Nothing in the library writes one
unless you pass `appendLogEntry`.

### `LogLevel`

`'debug' | 'info' | 'warn' | 'error' | 'fatal'`. The same values as a runtime array: `LOG_LEVELS`.

### `LOG_LEVELS`

`['debug', 'info', 'warn', 'error', 'fatal']`, read-only.

### `LogEventType`

`'audit' | 'error' | 'request' | 'system' | 'agent'`. The same values as a runtime array:
`LOG_EVENT_TYPES`.

### `LOG_EVENT_TYPES`

`['audit', 'error', 'request', 'system', 'agent']`, read-only.

### `LogOutcome`

`'ok' | 'fail' | 'denied' | 'unknown'`.

### `LogErrorDetails`

```ts nocheck
interface LogErrorDetails {
  name?: string;
  message: string;
  code?: string;
  stack?: string;
}
```

## HTTP: `@garkpit/mediator/http`

### `ok`

```ts nocheck
function ok<T>(data: T, init?: OkInit): Response
```

A JSON response `{"ok":true,"data":…}`. Status 200 unless `init.status` says otherwise.

### `OkInit`

```ts nocheck
interface OkInit {
  headers?: Record<string, string>;
  status?: number;
}
```

### `fail`

```ts nocheck
function fail<Code extends string = string>(
  error: ApiErrorShape<Code>,
  init?: { statusOverride?: number; table?: Record<string, number> }
): Response
```

A JSON response `{"ok":false,"error":{…}}`. The status is `init.statusOverride` if given, otherwise
the code looked up in `init.table`, otherwise in `DEFAULT_STATUS_FOR_CODE`.

### `ApiErrorShape`

```ts nocheck
interface ApiErrorShape<Code extends string = string> {
  code: Code;
  message: string;
  details?: unknown;
}
```

### `DEFAULT_STATUS_FOR_CODE`

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

### `statusForCode`

```ts nocheck
function statusForCode(code: string, table?: Record<string, number>): number
```

The status for a code from the table given (default `DEFAULT_STATUS_FOR_CODE`). Unknown codes give 500.

### `readBoundedBody`

```ts nocheck
function readBoundedBody(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>>
```

Reads a Fetch API request body into memory, up to `limit` bytes. A declared `content-length` over the
limit is refused before reading; a longer stream is cancelled as it passes the limit. A request with no
body gives an empty array. Throws `RequestBodyLimitError`. (Here `Request` is the Fetch API's, not the
mediator's.)

### `RequestBodyLimitError`

Thrown by `readBoundedBody`. `limit` is the limit in bytes; `declared` is the `content-length` the
client sent when that is what was over, otherwise `null`.

## Single-file entry points

Each source file is also importable on its own, for code that wants one piece without the rest (the
objects are the same ones the main entry exports):

`@garkpit/mediator/Request`, `/Handler`, `/Mediator`, `/RequestContext`, `/PipelineBehavior`,
`/HasMutexKey`, `/HasAuditInfo`, `/MutexHeldError`, `/audit-types`, `/log-types`, `/redactSecrets`,
`/behaviors/MutexBehavior`, `/behaviors/AuditBehavior`, `/behaviors/LoggingBehavior`, `/http`.

`@garkpit/mediator/Request` has no imports at all, which makes it the right entry for request classes
shared with browser code.
