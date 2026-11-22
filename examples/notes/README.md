# examples/notes

A small notes app that uses every part of `@garkpit/mediator`: four features as vertical slices, the
three built-in behaviors, an HTTP door built on the `ok`/`fail` envelope, and two doors for AI (a chat
assistant and MCP) that send the same Commands and Queries through the same pipeline.

It stores notes in memory and has no sign-in. It is for reading and running, not for deploying.

## Run it

From the repository root:

```sh
bun install
bun run example        # a narrated tour in one process; needs no port
```

The tour creates a note, has two people rename it at the same moment (one gets through, one receives
`409 MUTEX_HELD`), shows three kinds of failure in the same envelope, lets an assistant read at once and
propose a change that a person confirms, lets an MCP client create a note, then prints the audit trail:
one row per change, saying who made it and by which door.

Other commands:

```sh
bun examples/notes/main.ts serve --port 4400   # the HTTP door on your own machine
bun examples/notes/main.ts mcp                 # the MCP door on standard input and output
bun examples/notes/main.ts help
```

With the server running:

```sh
curl -s http://127.0.0.1:4400/capabilities
curl -s -X POST http://127.0.0.1:4400/notes -H 'content-type: application/json' -H 'x-actor: priya' -d '{"title":"Shopping"}'
curl -s -X PATCH http://127.0.0.1:4400/notes/n1 -H 'content-type: application/json' -H 'x-actor: priya' -d '{"title":"Groceries"}'
curl -s http://127.0.0.1:4400/notes
```

## What is where

```tree
main.ts                          the command line: tour, serve, mcp
src/
  app.ts                         builds the mediator and behaviors, registers the features
  store.ts                       notes in memory
  errors.ts                      typed errors, and the one function that maps them to error codes
  features/notes/
    index.ts                     one registration line per slice
    create-note/                 CreateNote (Command, audited)
    rename-note/                 RenameNote (Command, locked per note, audited)
    get-note/                    GetNote (Query)
    list-notes/                  ListNotes (Query)
  http/routes.ts                 thin routes: parse, send, ok/fail
  agent/
    catalogue.ts                 one tool entry per Command and Query
    assistant.ts                 the chat door: reads run, changes wait for a person
    mcp.ts                       the MCP door: tools/list and tools/call over JSON-RPC
```

Each slice folder holds the request class, its handler and a test.

## Things to try

- **Add a feature.** Copy `rename-note/` to `delete-note/`, rename the classes, write the handler, add
  one line to `features/notes/index.ts`. Run `bun test examples`. A test in `agent/agent.test.ts` now
  fails, because the tool catalogue no longer matches what the mediator has registered. Add the
  catalogue entry and it passes. That failing test is the point: a feature cannot be half added.
- **Change the order of the behaviors** in `app.ts` so audit comes before the lock, run the tour, and
  see the refused rename appear in the audit trail as a failure.
- **Connect a real MCP client** to `bun examples/notes/main.ts mcp`.

## How far the MCP door goes

`src/agent/mcp.ts` handles `initialize`, `ping`, `tools/list` and `tools/call`, which is enough for an
MCP client to list the four tools and call them. On 22 November 2026 it was checked against the
official MCP TypeScript SDK client, version 1.32.2, over standard input/output and over `POST /mcp`.
It has no authentication, no sessions and no streaming. For anything real, use the official MCP SDK
and keep only `listTools` and `callTool` from this file. See
[the agentic interface](../../docs/agentic-interface.md).
