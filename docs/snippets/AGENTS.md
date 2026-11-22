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
