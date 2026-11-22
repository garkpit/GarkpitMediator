# GarkpitMediator

**One front door for every feature.** `@garkpit/mediator` is a small CQRS mediator for TypeScript web
apps. Every feature becomes a named **Command** (it changes something) or **Query** (it reads
something) with exactly one handler, and every request travels the same pipeline of shared steps:
locking, an audit record, a log line, or your own.

The result is an app that stays easy to find your way around as it grows, for people and for AI coding
agents alike. And because everything the app can do is already a list of named, typed requests, that
list can be handed to a chat assistant or an MCP server as tools.

**Website and full docs: https://garkpit.github.io/GarkpitMediator/**

Zero runtime dependencies. Source-only TypeScript. Runs on [Bun](https://bun.sh) and on any bundler
that compiles TypeScript. MIT licence.

![The request pipeline: send passes through each behavior, outermost first, reaches the one handler, and the result travels back out through the same behaviors in reverse.](docs/images/pipeline.svg)

## Why

**For people.** A feature is one folder: a request class, a handler and a test. You find things by
name. Adding the hundredth feature costs what the first one did: a new folder and one registration
line. Rules that apply everywhere (locks, audit, logging, permissions) are written once, as behaviors,
and can never be forgotten on a new endpoint.

**For AI coding agents.** An agent starts every task knowing nothing about your project, and does best
where there is one obvious place for each thing. Here the answer to "where does this go?" is always
the same, the list of features can be read in seconds, and the compiler checks the wiring. The
repository ships an [`AGENTS.md` snippet](docs/snippets/AGENTS.md) that teaches an agent the pattern,
and the whole manual as one text file, [`llms-full.txt`](llms-full.txt), that travels with the library
into your project. See [Working with AI coding agents](docs/ai-coding-agents.md).

**For AI agents that use your app.** Every Command and Query is a tool waiting to be listed. Describe
each once and a chat assistant inside your app, or an outside agent over MCP, can read and operate the
app through the same locked, audited door that people use: reads run at once, changes wait for a person
to confirm. See [The agentic interface](docs/agentic-interface.md).

## 60-second quick start

```ts
import { AuditBehavior, Command, Query, createMediator, LoggingBehavior, MutexBehavior } from '@garkpit/mediator';

interface Note {
  id: string;
  title: string;
}
const notes = new Map<string, Note>([['n1', { id: 'n1', title: 'Shopping' }]]);

// A Query reads. A Command changes something. The type parameter is what the handler returns.
class GetNote extends Query<Note | undefined> {
  constructor(readonly id: string) {
    super();
  }
}

class RenameNote extends Command<Note> {
  constructor(readonly id: string, readonly title: string) {
    super();
  }
  // Opt in to shared rules by adding a method. The handler stays three lines.
  mutexKey() {
    return `note:${this.id}`; // one rename per note at a time
  }
  auditInfo() {
    return { action: 'note.rename', resourceId: this.id, details: { title: this.title } };
  }
}

// One mediator. Behaviors wrap every request, outermost first.
export const mediator = createMediator({
  behaviors: [
    new MutexBehavior(),
    new AuditBehavior({ appendEntry: async (entry) => console.log('audit:', entry.actor, entry.action, entry.outcome), mapError: () => ({ code: 'INTERNAL' }) }),
    new LoggingBehavior()
  ]
});

// Exactly one handler per request class.
mediator.register(GetNote, { handle: async (query) => notes.get(query.id) });
mediator.register(RenameNote, {
  handle: async (command) => {
    const note = { id: command.id, title: command.title };
    notes.set(note.id, note);
    return note;
  }
});

// Send from anywhere: a route, a test, a job, an AI agent. The result is typed.
const renamed = await mediator.send(new RenameNote('n1', 'Weekly shop'), { actor: 'priya' });
console.log(renamed.title, mediator.registeredRequestTypes());
```

```text
[mediator] RenameNote ok (0.3ms)
audit: priya note.rename ok
Weekly shop [ "GetNote", "RenameNote" ]
```

Want to see a whole app? `bun install && bun run example` runs [`examples/notes`](examples/notes/README.md):
four features, an HTTP door, a chat-assistant door and an MCP door, one pipeline.

## What is in the box

| Part | What it does |
|---|---|
| `Command`, `Query`, `Handler` | The request classes and the one-method handler interface. |
| `Mediator`, `createMediator` | `register` a handler, `send` a request, `use` a behavior, and list what is registered. |
| `MutexBehavior` | Stops two commands that name the same key from running at once. Fails fast, releases on every exit. |
| `AuditBehavior` | One record per audited request, success or failure, with secrets redacted. Never changes the outcome. |
| `LoggingBehavior` | One line per request with its name, outcome and duration. |
| `PipelineBehavior` | The interface for your own: permissions, rate limits, timing, anything that should apply to every request. |
| `@garkpit/mediator/http` | `ok` and `fail` for one JSON response shape, and `readBoundedBody` to refuse oversized request bodies. |

## Documentation

1. [Getting started](docs/getting-started.md)
2. [Commands and Queries](docs/commands-and-queries.md)
3. [Behaviors](docs/behaviors.md): the built-in three, and writing your own
4. [The HTTP envelope and body limits](docs/http.md)
5. [Growing an app with vertical slices](docs/vertical-slices.md)
6. [Working with AI coding agents](docs/ai-coding-agents.md)
7. [The agentic interface](docs/agentic-interface.md): chat and MCP
8. [API reference](docs/api-reference.md)
9. [FAQ and gotchas](docs/faq.md)

Plus a one-page [cheat sheet](docs/cheatsheet/GarkpitMediator-CheatSheet.md)
([PDF](docs/cheatsheet/GarkpitMediator-CheatSheet.pdf)), and [`llms.txt`](llms.txt) for language models.

## Things to know before you adopt it

- **Handlers are found by class name,** not class identity, so development hot reload keeps working.
  The cost: request class names must be unique within one mediator, and a minifier must not rename
  classes in a server bundle (`--keep-names` in Bun, `keepNames` in esbuild). See the
  [FAQ](docs/faq.md#my-production-build-misbehaves-but-development-works).
- **The lock is in-process.** `MutexBehavior` holds its locks in memory. It does not coordinate across
  several server processes. Build one instance and reuse it.
- **`allowReplace` is for development hot reload only.** In production a duplicate registration throws.
- **Audit writers are isolated.** A writer that throws is reported and the command's result is
  unchanged.

## Using it

There is no npm package. Copy the library into your project as a synced export (a folder you replace
wholesale, never edit) and record the commit you took:

```sh
git clone https://github.com/garkpit/GarkpitMediator.git ../GarkpitMediator
mkdir -p packages/mediator
git -C ../GarkpitMediator archive HEAD src package.json tsconfig.json LICENSE README.md llms-full.txt \
  | tar -x -C packages/mediator
echo "Source: https://github.com/garkpit/GarkpitMediator at $(git -C ../GarkpitMediator rev-parse HEAD)" \
  > packages/mediator/SOURCE.md
```

Then depend on it as a workspace package (`"@garkpit/mediator": "workspace:*"`). The full steps are in
[Getting started](docs/getting-started.md#install-copy-it-in).

## Develop

```sh
bun install
bun run check      # typecheck, unit tests, the example's tests, the docs check, cheat-sheet drift
bun run example    # the narrated tour of examples/notes
bun run docs       # regenerate llms.txt, llms-full.txt and the diagrams
bun run site       # build the documentation site into dist/site
bun run site:serve # build it and serve it on your own machine
```

Nothing under `src/` depends on anything outside it. The docs, example and site tooling use only Bun
and the TypeScript compiler.

## Disclaimer

A small personal project, shared as is under the [MIT licence](LICENSE): no warranty, no support and
no promise of stability between versions. It is not a product of, or endorsed by, any employer. Issues
and pull requests may go unanswered.
