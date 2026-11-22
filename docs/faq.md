# FAQ and gotchas

## Why are handlers keyed by class name?

The mediator finds a handler by the request class's *name* (the string `'RenameNote'`), not by the
class object itself. That is deliberate. In development, tools such as Vite reload a changed file by
evaluating it again, which creates a brand-new class object with the same name. A mediator keyed by
the object would no longer recognise requests built from the reloaded class. Keyed by name, it does.

It has two consequences you need to know about, covered in the next two answers.

## My production build misbehaves, but development works

Your bundler is probably shortening class names. A minifier may rename `class RenameNote` to something
like `class c`, and the mediator finds handlers by name. What happens next depends on the build:

- In a single bundle, sending may still work, but every name the app reports is now nonsense: log
  lines read `[mediator] c ok`, audit rows record `commandName: "c"`, and
  `registeredRequestTypes()` returns `["c", "f"]`. Anything that refers to a request by its name as
  a string (a tool catalogue, a stored audit row, a dashboard) stops matching.
- Across bundles built separately, the same class can be given different short names, or two classes
  the same one. Then `send` fails with "No mediator handler registered", or reaches the wrong handler.

Keep class names in any bundle that runs the mediator:

| Tool | Setting |
|---|---|
| Bun's bundler | add `--keep-names` when you use `--minify` |
| esbuild | `keepNames: true` |
| Terser | `keep_classnames: true` |
| Vite | server (SSR) builds are not minified by default; leave that as it is |

Or do not minify server code at all. It runs on your server; nobody downloads it.

## Can two request classes have the same name?

Not in one mediator. Registering the second one throws `HandlerAlreadyRegisteredError` at start-up, so
you find out immediately. If two feature areas both want an `Archive`, name them for what they do:
`ArchiveNote` and `ArchiveProject`. The names then read better in logs and audit rows too.

## Hot reload crashes with "handler already registered"

When a development server reloads a file that registers a handler, the registration line runs again on
the same mediator. In production that would be a bug, so it throws. In development, allow it:

```ts
import { Command, createMediator, LoggingBehavior } from '@garkpit/mediator';

class RenameNote extends Command<void> {}

const dev = process.env.NODE_ENV !== 'production';
const mediator = createMediator();

mediator.register(RenameNote, { handle: async () => {} }, { allowReplace: dev });
mediator.use(new LoggingBehavior(), { allowReplace: dev }); // replaced in place, order kept
```

Only ever pass `allowReplace: true` from development code. In production you want the loud failure.

## Does the lock work across several servers?

No. `MutexBehavior` keeps its locks in memory, inside one instance, inside one process. It stops two
requests *in the same process* from colliding. It does nothing across two server processes, two
containers or a restart.

That is enough for an app that runs as a single process, which many do. If you run several, write your
own behavior with the same shape that takes the lock somewhere shared (a database advisory lock, Redis),
and use it in place of `MutexBehavior`. The commands do not change: they still just declare
`mutexKey()`.

Two related points:

- Build one `MutexBehavior` at start-up and give that same instance to every mediator. Two instances
  do not know about each other's locks.
- The lock fails fast. A second command on a held key gets `MutexHeldError` straight away; it does not
  wait. Retry in the caller if you want waiting.

## Why did my refused command leave no audit row?

Behaviors run outermost first. With `[mutex, audit, logging]`, a command refused by the lock never
reaches the audit step. List `audit` before `mutex` if you want refusals recorded as failures.

## My handler needs to know who the user is

The request context (`{ actor }`) goes to behaviors, not to handlers. Put what the handler needs on
the request itself, at the point where you build it:

```ts
import { Query } from '@garkpit/mediator';

export class ListMyNotes extends Query<string[]> {
  constructor(readonly ownerId: string) {
    super();
  }
}

// in the route: new ListMyNotes(session.userId)
```

This keeps handlers easy to test (no hidden inputs) and makes the request a complete description of
what was asked.

## Can I use request classes in browser code?

Yes, but import them from the narrow entry point. The main entry, `@garkpit/mediator`, also exports
`AuditBehavior`, which uses Node's `crypto` module, and you do not want that in a browser bundle. The
base classes have an entry of their own with no imports at all:

```ts
import { Command, Query } from '@garkpit/mediator/Request';

export class RenameNote extends Command<void> {
  constructor(readonly id: string, readonly title: string) {
    super();
  }
}

export class GetNote extends Query<{ id: string; title: string }> {
  constructor(readonly id: string) {
    super();
  }
}
```

In the same spirit, `ok`, `fail` and `readBoundedBody` live only in `@garkpit/mediator/http`.

## The library exports a class called Request. Does that clash with fetch's Request?

It can. If you write `import { Request } from '@garkpit/mediator'` in a file that also handles HTTP,
your import hides the built-in one. You rarely need the base class by name (extend `Command` or `Query`
instead), and when you do, rename it on the way in:

```ts
import type { Request as MediatorRequest } from '@garkpit/mediator';

export function describe(request: MediatorRequest<unknown>): string {
  return request.constructor.name;
}
```

## TypeScript cannot work out my handler's types

`register` infers the request and result types from what you pass. Occasionally it needs help, most
often when a handler for a `Command<void>` always throws or returns something unusual. Name the types
yourself:

```ts
import { Command, createMediator } from '@garkpit/mediator';

class NotBuiltYet extends Command<void> {}

const mediator = createMediator();
mediator.register<void, NotBuiltYet>(NotBuiltYet, {
  handle: async () => {
    throw new Error('Not built yet.');
  }
});
```

Writing handlers as classes that `implements Handler<TheRequest, TheResult>` avoids the question.

## Should one handler send another request?

Prefer not to. A handler that sends a second command through the mediator can deadlock itself on a
lock it already holds (the second command is refused with `MutexHeldError`), and it hides a dependency
between two features. If two features share logic, put it in a plain function. If one user action
needs two commands, let the caller send both, or write a third command that declares every lock it
needs up front with an array from `mutexKey()`.

## Is there an npm package?

No. You copy the source into your project and note the commit, as described in
[Getting started](getting-started.md#install-copy-it-in). The library is small enough to read in one
sitting, it has no dependencies of its own, and a copy cannot change underneath you.

## How stable is it? Who supports it?

It is a small personal project shared as it is, under the MIT licence: no warranty, no support, and no
promise that versions stay compatible. Because you hold your own copy, nothing changes for you until
you choose to take a newer one. Read the [changelog](../CHANGELOG.md) before you do.

## What does it not do?

- No dependency injection container. Pass a handler what it needs through its constructor.
- No events or publish/subscribe. One request, one handler.
- No validation library. Parse input however you like before building a request.
- No retries, queues or scheduling.
- No distributed locking (see above).

Each of those is a deliberate omission. The library is the dispatch, the pipeline and the envelope, and
it aims to stay small enough that you, and a coding agent, can hold all of it in mind.
