# Behaviors

A **behavior** is a step that wraps every request on its way to the handler and on its way back. It is
where you put the rules that would otherwise be copied into every endpoint: take a lock, write an audit
record, log a line, check a permission. Other frameworks call the same idea middleware.

![The request pipeline: send passes through each behavior, outermost first, reaches the one handler, and the result travels back out through the same behaviors in reverse.](images/pipeline.svg)

Behaviors run in the order you list them, outermost first. With `[mutex, audit, logging]`, a request
passes through the lock, then the audit step, then the logger, reaches the handler, and the result
travels back out through the logger, the audit step and the lock.

```ts
import { AuditBehavior, createMediator, LoggingBehavior, MutexBehavior } from '@garkpit/mediator';

// Build stateful behaviors once, where the app starts, and reuse them.
const mutex = new MutexBehavior();
const audit = new AuditBehavior({
  appendEntry: async (entry) => console.log('audit', entry.action, entry.outcome),
  mapError: () => ({ code: 'INTERNAL' })
});

export const mediator = createMediator({ behaviors: [mutex, audit, new LoggingBehavior()] });
```

**The order is a decision.** With the lock outermost, a command that is refused because the lock is
held never reaches the audit step, so a refusal leaves no audit row. Put `audit` first if you want
refused attempts recorded as failures.

## MutexBehavior: one at a time

A mutex (short for mutual exclusion) is a lock. `MutexBehavior` makes sure two commands that name the
same key never run at once. A command opts in by having a `mutexKey()` method:

```ts
import { Command, type HasMutexKey } from '@garkpit/mediator';

// One key: only one rename per note at a time. Renames of different notes run side by side.
export class RenameNote extends Command<void> implements HasMutexKey {
  constructor(readonly id: string, readonly title: string) {
    super();
  }
  mutexKey() {
    return `note:${this.id}`;
  }
}

// Several keys: all taken together, or none.
export class MoveNote extends Command<void> implements HasMutexKey {
  constructor(readonly noteId: string, readonly fromFolder: string, readonly toFolder: string) {
    super();
  }
  mutexKey() {
    return [`note:${this.noteId}`, `folder:${this.fromFolder}`, `folder:${this.toFolder}`];
  }
}
```

How it behaves:

- **It fails fast; it does not queue.** If a key is held, the second command is rejected at once with
  `MutexHeldError` (its `key` property says which). The caller decides whether to retry. A web route
  usually answers `409`.
- **Several keys are all-or-nothing.** If any one is held, none is taken, so nothing is left half
  locked. Keys are sorted before they are taken, which rules out two commands each waiting for the
  other.
- **Locks are always released,** whether the handler returns or throws.
- **Requests without `mutexKey()` pass straight through.** Queries normally have none.
- **The locks live in this one process.** They are a set in memory inside the `MutexBehavior` instance.
  They do not coordinate across several servers or across restarts. Build one instance at start-up and
  give that same instance to every mediator you create. If you run more than one server process and
  need a lock they all respect, write a behavior that takes it from your database or Redis; the
  interface is the same.

## AuditBehavior: who did what

`AuditBehavior` writes one record for every request that has an `auditInfo()` method: one row when it
succeeds, one row when it fails. You supply the function that stores the row.

```ts
import { AuditBehavior, Command, MutexHeldError, type AuditEntry, type AuditInfo, type HasAuditInfo } from '@garkpit/mediator';

export class DeleteNote extends Command<void> implements HasAuditInfo {
  constructor(readonly id: string, readonly reason: string) {
    super();
  }
  auditInfo(): AuditInfo {
    return { action: 'note.delete', resourceId: this.id, details: { reason: this.reason } };
  }
}

const rows: AuditEntry[] = [];

export const audit = new AuditBehavior({
  // Required: store one row. In a real app this is a database insert.
  appendEntry: async (entry) => {
    rows.push(entry);
  },
  // Required: turn any thrown error into a short code for the row.
  mapError: (error) => ({ code: error instanceof MutexHeldError ? 'MUTEX_HELD' : 'INTERNAL' })
});
```

Each row is an `AuditEntry`:

| Field | Contents |
|---|---|
| `id`, `timestamp` | A fresh UUID and the ISO time the row was built |
| `actor` | `ctx.actor`, or `'system'` when `send` was called without a context (change it with `defaultActor`) |
| `action`, `resourceId`, `details` | What the command reported in `auditInfo()` |
| `outcome` | `'ok'` or `'fail'` |
| `error` | On failure: `{ code, message }`, the code from your `mapError` |
| `commandName`, `durationMs` | The request class name and how long the handler took |
| `correlationId` | `ctx.correlationId`, when given |
| `schemaVersion` | `2`, so stored rows can be told apart if the shape ever changes |

Things worth knowing:

- **Auditing never changes the outcome.** If your `appendEntry` throws, the failure is reported (to
  `console.error`, or to your `reportFailure`) and the command's own result or error reaches the caller
  untouched.
- **Secrets are redacted before the row is stored.** Any value in `details` whose *key* looks secret
  (`token`, `password`, `api_key`, `authorization`, `cookie`, and similar) becomes `[REDACTED]`, four
  levels deep. Pass your own `redactSecrets` to change the rule. For secret *values* under innocent
  keys, pass them in `ctx.secrets` and they are scrubbed from the details and the error message
  wherever they appear.
- **`auditInfo()` is read after the handler runs.** A handler can set a field on the command first (the
  id of the thing it just created, a snapshot of what it deleted) and the row will include it.
- **A change that changed nothing is not recorded.** If `details.columnsPatched` is an empty array, no
  row is written. Use it for "save" buttons pressed with nothing edited.
- **Any request can be audited,** Queries included: give a sensitive read an `auditInfo()` and it gets
  a row.

### Your own audit fields

Apps often need an extra dimension on every row: which customer account, which workspace. Extend
`AuditInfo`, and your writer receives the command's own info next to the entry:

```ts
import { AuditBehavior, Command, type AuditInfo, type HasAuditInfo } from '@garkpit/mediator';

interface WorkspaceAuditInfo extends AuditInfo {
  workspace: string;
}

export class ArchiveProject extends Command<void> implements HasAuditInfo<WorkspaceAuditInfo> {
  constructor(readonly workspace: string, readonly projectId: string) {
    super();
  }
  auditInfo(): WorkspaceAuditInfo {
    return { action: 'project.archive', workspace: this.workspace, resourceId: this.projectId, details: {} };
  }
}

declare function insertAuditRow(row: object): Promise<void>;

export const audit = new AuditBehavior<WorkspaceAuditInfo>({
  appendEntry: async (entry, info) => insertAuditRow({ ...entry, workspace: info.workspace }),
  mapError: () => ({ code: 'INTERNAL' })
});
```

### Mirroring into a general log

If you also keep one general application log, pass `appendLogEntry` and `logSource` and each audit row
is copied into it as a `LogEntry` (the function `auditEntryToLogEntry` does the conversion, and is
exported if you want it elsewhere).

## LoggingBehavior: one line per request

```ts
import { createMediator, LoggingBehavior } from '@garkpit/mediator';

// Default: console.log
const quick = createMediator({ behaviors: [new LoggingBehavior()] });

// Or send the lines wherever you like. `error` is set when the request failed.
const lines: string[] = [];
const collected = createMediator({
  behaviors: [new LoggingBehavior((line, error) => lines.push(error ? `${line} ${String(error)}` : line))]
});
```

It prints `[mediator] RenameNote ok (1.2ms)` on success and `[mediator] RenameNote FAIL (0.4ms):`
followed by the error on failure, then passes the error on unchanged.

## Writing your own

A behavior is a class with one method, `invoke(request, next, ctx)`. Call `next()` to carry on down the
pipeline. Do work before it, after it, or instead of it.

**Do something around every request:**

```ts
import type { Next, PipelineBehavior, Request, RequestContext } from '@garkpit/mediator';

/** Warns when any request takes longer than its budget. */
export class SlowRequestBehavior implements PipelineBehavior {
  constructor(private readonly budgetMs: number) {}

  async invoke<TRequest extends Request<TResponse>, TResponse>(
    request: TRequest,
    next: Next<TResponse>,
    ctx?: RequestContext
  ): Promise<TResponse> {
    const started = performance.now();
    try {
      return await next();
    } finally {
      const took = performance.now() - started;
      if (took > this.budgetMs) {
        console.warn(`${request.constructor.name} took ${took.toFixed(0)}ms for ${ctx?.actor ?? 'unknown'}`);
      }
    }
  }
}
```

**Stop a request before it reaches the handler.** The built-in behaviors use a small pattern you can
copy: the request opts in with a method, and the behavior checks for that method.

```ts
import type { Next, PipelineBehavior, Request, RequestContext } from '@garkpit/mediator';

/** A request that needs a role implements this. */
export interface RequiresRole {
  requiredRole(): string;
}

function requiresRole(request: unknown): request is RequiresRole {
  return typeof request === 'object' && request !== null && typeof (request as RequiresRole).requiredRole === 'function';
}

export class ForbiddenError extends Error {}

export class PermissionBehavior implements PipelineBehavior {
  constructor(private readonly rolesOf: (actor: string) => Promise<readonly string[]>) {}

  async invoke<TRequest extends Request<TResponse>, TResponse>(
    request: TRequest,
    next: Next<TResponse>,
    ctx?: RequestContext
  ): Promise<TResponse> {
    if (requiresRole(request)) {
      const roles = ctx ? await this.rolesOf(ctx.actor) : [];
      if (!roles.includes(request.requiredRole())) {
        throw new ForbiddenError(`${request.constructor.name} needs the "${request.requiredRole()}" role.`);
      }
    }
    return next();
  }
}
```

Now a permission rule is one method on a command (`requiredRole() { return 'admin'; }`), it is enforced
for every caller including AI agents, and nobody can forget to add the check to a new endpoint.

Rules for behaviors:

- **Write them as classes.** The mediator tells behaviors apart by class name and allows each class
  once per mediator; a second `use` of the same class throws `BehaviorAlreadyRegisteredError`. Two
  plain object literals would both be named `Object` and collide.
- **Add them with `createMediator({ behaviors })` or `mediator.use(behavior)`.** Both append, so the
  first one added is the outermost.
- **Keep state that must outlive a request in the behavior instance,** and build that instance once.
- **Do not swallow errors.** Let them travel back out so the behaviors around you, and the caller, see
  them.

## Where next

- [The HTTP envelope](http.md): the JSON shape for results and errors.
- [API reference](api-reference.md): every option of every behavior.
