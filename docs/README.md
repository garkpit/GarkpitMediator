# GarkpitMediator documentation

`@garkpit/mediator` gives every feature in a TypeScript app one front door: a named Command or Query,
one handler, and a shared pipeline around it. These guides take you from the first request to an app
that AI agents can read and operate.

## Start here

1. [Getting started](getting-started.md): copy the library in, write your first Command and Query, add
   locking and an audit trail.
2. [Commands and Queries](commands-and-queries.md): request classes, handlers, registering, sending,
   and the request context that says who is asking.
3. [Behaviors](behaviors.md): the pipeline around every request: the built-in lock, audit and logging
   behaviors, and how to write your own.
4. [The HTTP envelope and body limits](http.md): `ok` and `fail` JSON responses, error codes and
   statuses, and reading a request body with a size limit.

## Growing, with people and with AI

5. [Growing an app with vertical slices](vertical-slices.md): one folder per feature: the layout, the
   rules, and why a change costs the same at any size.
6. [Working with AI coding agents](ai-coding-agents.md): why this structure suits coding agents, the
   snippet for your `AGENTS.md`, and `llms.txt`.
7. [The agentic interface](agentic-interface.md): turn your Commands and Queries into tools for a chat
   assistant and an MCP server, through the same audited pipeline.

## Reference

8. [API reference](api-reference.md): every export, checked against the source.
9. [FAQ and gotchas](faq.md): minifiers and class names, hot reload, locks across servers, browser
   imports, and what the library does not do.

## Also here

- [The cheat sheet](cheatsheet/GarkpitMediator-CheatSheet.md) (also as
  [HTML](cheatsheet/GarkpitMediator-CheatSheet.html) and
  [PDF](cheatsheet/GarkpitMediator-CheatSheet.pdf)): install, the API, recipes and gotchas on one page.
- [The AGENTS.md snippet](snippets/AGENTS.md) as a plain file.
- [`examples/notes`](../examples/notes/README.md): a small runnable app that uses everything in these
  guides.
- [`llms.txt`](../llms.txt) and [`llms-full.txt`](../llms-full.txt): the same documentation in a form
  for language models.

## How these docs stay true

`bun run check` compiles every TypeScript sample on these pages against the real source (the few
marked as sketches are skipped and say so), checks that the API reference names every export and
nothing else, follows every link, and confirms that the generated files (`llms.txt`, the diagrams, the
cheat sheet) match what they are generated from. If the code changes and a page does not, the check
fails.
