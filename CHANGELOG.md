# @garkpit/mediator

## Documentation, example and site (no library change)

- Nine guides in `docs/`, with every TypeScript sample compiled against `src/` by `bun run check`.
- `examples/notes`: a runnable app with four features, an HTTP door, a chat-assistant door and an MCP door.
- `llms.txt`, `llms-full.txt`, an `AGENTS.md` snippet for projects that use the library, and a cheat sheet.
- A static documentation site, built with `bun run site`.
- `src/` is unchanged from 0.2.0.

## 0.2.0

First release in its own repository. Earlier versions lived inside another project's monorepo, so the
history starts here.

- `RequestContext.secrets` lists values an audit row must never contain; `AuditBehavior` replaces them
  with `[REDACTED]` in the details (any key, any depth) and in the error message. Absent, nothing changes.
