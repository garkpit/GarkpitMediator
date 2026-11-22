# Getting started

`@garkpit/mediator` is a small TypeScript library that gives every feature in your app one front door.
Each thing the app can do is a named class: a **Command** if it changes something, a **Query** if it
only reads. You hand one to the **mediator** (the object that knows which piece of code handles which
request) and it runs the one handler registered for that class, wrapped in whatever shared steps you
have installed: locking, an audit record, a log line, or your own.

It has no runtime dependencies and ships as TypeScript source. It runs on [Bun](https://bun.sh) and on
any bundler that compiles TypeScript.

## Install: copy it in

There is no npm package. You copy the source into your project and record which commit you took. The
copy is called a *synced export*: a folder you never edit by hand and replace wholesale when you want
a newer version.

```sh
# 1. Fetch the library somewhere outside your app
git clone https://github.com/garkpit/GarkpitMediator.git ../GarkpitMediator

# 2. Copy the library files (not the docs site or examples) into your app
mkdir -p packages/mediator
git -C ../GarkpitMediator archive HEAD src package.json tsconfig.json LICENSE README.md llms-full.txt \
  | tar -x -C packages/mediator

# 3. Record where it came from
echo "Source: https://github.com/garkpit/GarkpitMediator at $(git -C ../GarkpitMediator rev-parse HEAD)" \
  > packages/mediator/SOURCE.md
```

Then make it a workspace package. In your app's `package.json`:

```json
{
  "workspaces": ["packages/*"],
  "dependencies": {
    "@garkpit/mediator": "workspace:*"
  }
}
```

Run `bun install` and import from `@garkpit/mediator`. The copied folder includes `llms-full.txt`, the
whole manual as one text file, so a coding agent working in your repository can read how the library
works without leaving it. See [Working with AI coding agents](ai-coding-agents.md).

Prefer no workspace? Copy just `src/` to somewhere like `src/lib/mediator/` and import it by relative
path. Everything on this site works the same way.

## Your first Command and Query

```ts
import { Command, Query, createMediator, LoggingBehavior } from '@garkpit/mediator';

interface Note {
  id: string;
  title: string;
}
const notes = new Map<string, Note>();

// A Query reads. Its type parameter is what the handler returns.
class GetNote extends Query<Note | undefined> {
  constructor(readonly id: string) {
    super();
  }
}

// A Command changes something.
class AddNote extends Command<Note> {
  constructor(readonly title: string) {
    super();
  }
}

// One mediator for the app. LoggingBehavior prints one line per request.
const mediator = createMediator({ behaviors: [new LoggingBehavior()] });

// Exactly one handler per request class.
mediator.register(GetNote, { handle: async (query) => notes.get(query.id) });
mediator.register(AddNote, {
  handle: async (command) => {
    const note = { id: `n${notes.size + 1}`, title: command.title };
    notes.set(note.id, note);
    return note;
  }
});

// Send a request. The second argument says who is asking.
const added = await mediator.send(new AddNote('Buy oat milk'), { actor: 'priya' });
const found = await mediator.send(new GetNote(added.id), { actor: 'priya' });
console.log(found?.title); // "Buy oat milk"
```

Running it prints:

```text
[mediator] AddNote ok (0.2ms)
[mediator] GetNote ok (0.0ms)
Buy oat milk
```

Three things to notice:

- **`send` is typed end to end.** `added` is a `Note` and `found` is a `Note | undefined`, taken from the
  class's type parameter. There is no casting and no string name to mistype.
- **The caller does not know the handler.** A route, a test, a scheduled job and a chat assistant all
  send the same `AddNote`. You can move, rewrite or split the handler without touching any of them.
- **The log line came from the pipeline.** Neither handler mentions logging. The next section is why
  that matters.

## Add locking and an audit trail without touching a handler

Shared steps are called **behaviors**. Each one wraps every request, so a rule written once applies
everywhere. Two come with the library:

- `MutexBehavior` stops two commands working on the same thing at the same time.
- `AuditBehavior` writes one record of who did what, whether it worked or failed.

A command opts in by adding a method. Nothing else changes:

```ts
import { AuditBehavior, Command, createMediator, LoggingBehavior, MutexBehavior, type AuditEntry } from '@garkpit/mediator';

class RenameNote extends Command<void> {
  constructor(readonly id: string, readonly title: string) {
    super();
  }
  // "Only one rename of this note at a time."
  mutexKey() {
    return `note:${this.id}`;
  }
  // "Record this change."
  auditInfo() {
    return { action: 'note.rename', resourceId: this.id, details: { title: this.title } };
  }
}

const auditLog: AuditEntry[] = [];

const mediator = createMediator({
  // Outermost first: take the lock, then audit, then log, then run the handler.
  behaviors: [
    new MutexBehavior(),
    new AuditBehavior({
      appendEntry: async (entry) => {
        auditLog.push(entry); // a real app inserts a database row here
      },
      mapError: () => ({ code: 'INTERNAL' })
    }),
    new LoggingBehavior()
  ]
});

mediator.register(RenameNote, { handle: async () => {} });
await mediator.send(new RenameNote('n1', 'Weekly shop'), { actor: 'priya' });
console.log(auditLog[0]?.action, auditLog[0]?.actor, auditLog[0]?.outcome); // note.rename priya ok
```

## See it all working

The repository has a small runnable app, [`examples/notes`](../examples/notes/README.md), with four
features, an HTTP door, a chat-assistant door and an MCP door, all sharing one pipeline:

```sh
git clone https://github.com/garkpit/GarkpitMediator.git
cd GarkpitMediator
bun install
bun run example
```

## Where next

- [Commands and Queries](commands-and-queries.md): the request classes in detail.
- [Behaviors](behaviors.md): the three built in, and how to write your own.
- [Growing an app with vertical slices](vertical-slices.md): the folder layout that keeps a growing
  codebase easy to find your way around.
- [Working with AI coding agents](ai-coding-agents.md): the snippet to paste into your `AGENTS.md`.
