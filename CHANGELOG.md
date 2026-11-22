# @garkpit/mediator

## 0.2.0

First release in its own repository. Earlier versions lived inside another project's monorepo, so the
history starts here.

- `RequestContext.secrets` lists values an audit row must never contain; `AuditBehavior` replaces them
  with `[REDACTED]` in the details (any key, any depth) and in the error message. Absent, nothing changes.
