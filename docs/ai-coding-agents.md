# Working with AI coding agents

An AI coding agent (Claude Code, Codex, Cursor and the like) is a fast, capable programmer that starts
every task knowing nothing about your project. It reads a few files, forms a picture, and writes code
that fits the picture. Whether that goes well depends far more on the shape of your codebase than on
the model.

## Why a mediator helps

**There is one obvious place for each thing.** Ask an agent to "let users archive a note" in a typical
app and it has to guess: a new route file, or the existing one? Logic in the route, or a service? Which
of the three existing patterns should it copy? Each guess is a chance to drift. In a mediator app the
answer is always the same: a new folder with a request class, a handler and a test. The agent copies
the folder next door.

**The app can be listed.** The feature folders, and `mediator.registeredRequestTypes()`, are a complete
inventory of what the app does. An agent can read that list in seconds instead of inferring features
from a tangle of routes. Finding the code to change becomes a lookup, not a search.

**Shared rules cannot be forgotten.** Locking, auditing, logging and permission checks live in
behaviors that wrap every request. The agent does not need to remember to add them to a new endpoint,
so it cannot forget.

**Small files, small context.** A slice is three short files. The agent reads only those to change a
feature, which leaves more of its working memory for the task and less for reading unrelated code.

**The compiler checks the wiring.** `send` returns the type the request class declares, so a wrong
result type or a missing field is a compile error the agent sees and fixes itself.

None of this is specific to one model or tool. It is the same thing that helps a new human colleague,
which is the point: agents do well in codebases where people do well.

## The snippet for your AGENTS.md

`AGENTS.md` is the file most coding agents read first in a repository (Claude Code reads `CLAUDE.md`;
the content is the same). Paste this into yours and adjust the paths to match your project:

```md
## Features go through the mediator

This app uses `@garkpit/mediator` (copied into `packages/mediator`; the full manual is
`packages/mediator/llms-full.txt`). Every feature is one Command (it changes something) or one Query
(it only reads), and each has exactly one handler.

To add or change a feature:

1. Look first. Each feature is a folder at `src/features/<area>/<verb-noun>/`. List them and reuse or
   extend an existing one before creating a new one.
2. A new feature is a new folder with three files. Copy the nearest existing slice and rename:
   - `VerbNoun.ts`: the request class. It `extends Command<Result>` or `extends Query<Result>`, its
     constructor takes typed, already-valid values, and a static `parse(input: unknown)` validates
     untyped input.
   - `VerbNounHandler.ts`: `implements Handler<VerbNoun, Result>`. All the logic lives here. It never
     touches the HTTP request or response.
   - `VerbNoun.test.ts`: sends the request through the real mediator and checks the result.
3. Register it with one line in the area's `index.ts`:
   `mediator.register(VerbNoun, new VerbNounHandler(deps))`.
4. Keep routes thin: parse the input, `mediator.send(request, { actor })`, then `ok(data)` or
   `fail(error)`. A route holds no business logic and never touches the database.

Rules:

- Never call a handler directly, and never call one handler from another. Send a request, or move the
  shared code into a plain function that both handlers import.
- Never write locking, audit or logging code in a handler. A command that must not run twice at once on
  the same thing implements `mutexKey()`. A command that should leave a record implements
  `auditInfo()`. The pipeline does the rest.
- Request class names are unique across the app: the mediator finds handlers by class name.
- Every `send` passes `{ actor }` as its second argument.
- Handlers throw typed errors. One shared function maps errors to error codes; do not map them inside
  a route.
- A Query never changes anything. If it does, it is a Command.
- Run `bun run check` before saying the work is done.
```

The same text is a file in the repository,
[`docs/snippets/AGENTS.md`](snippets/AGENTS.md), so you can fetch it from a script.

## The manual, in a form agents can read

Two plain-text files follow the [llms.txt](https://llmstxt.org) convention, a simple way of giving a
language model a project's documentation without the web page around it:

- [`llms.txt`](../llms.txt): a short index of these guides with one line about each.
- [`llms-full.txt`](../llms-full.txt): every guide joined into one file. Give an agent this and it has
  the whole manual.

Both are generated from these Markdown guides and checked on every `bun run check`, so they cannot
fall behind. `llms-full.txt` is one of the files the [install step](getting-started.md#install-copy-it-in)
copies into your project, which is why the snippet above can point at
`packages/mediator/llms-full.txt`.

## Prompts that work well

Because features have names, you can use them:

- "Add an `ArchiveNote` command next to `RenameNote`. Lock on the note. Audit it."
- "`ListInvoices` should accept an `unpaidOnly` filter. Update the handler and its test."
- "List every Command that has no `auditInfo()`."
- "Write a behavior that rejects any Command whose actor is `anonymous`, and add it outermost."

Each of those names a single, findable place. Compare "make archiving work", which sends the agent
exploring.

## Reviewing what an agent wrote

A slice is quick to review because there are few ways for it to be wrong:

- Is the new folder under the right feature area, with a request, a handler and a test?
- Does the request class name say what happens, and is it unique?
- Does a Command that touches shared data have a `mutexKey()`? Should it have an `auditInfo()`?
- Is there any logic in the route that belongs in the handler?
- Does the test send the request through the mediator, not call the handler directly?
- Is it registered?

## What this does not do

It does not make a model smarter, and it will not stop an agent writing a poor handler. What it does is
narrow where the agent has to look and where its code has to go, and that removes the most common way
agent-written code goes wrong in a large project: a reasonable change, put in the wrong place, in a
slightly different style from everything around it.

## Where next

- [The agentic interface](agentic-interface.md): letting AI agents *use* your app, not just write it.
- [Growing an app with vertical slices](vertical-slices.md): the layout the snippet assumes.
