/**
 * Per-request context threaded through `mediator.send` into every PipelineBehavior. It carries the
 * audit actor today and widens (permissions, tenant, request id) without breaking any Command.
 */
export interface RequestContext {
  actor: string;
  readonly correlationId?: string;
  /**
   * Extra key/values merged into the audit entry's `details` for THIS send (after the DTO's own
   * `auditInfo().details`, before redaction, and never overwriting them). Example: an assistant that
   * sends a confirmed proposal adds `{ via: 'assistant-chat', proposalId }`; the Command is the same
   * one a page button sends, only the route by which a human confirmed it differs.
   */
  readonly audit?: Readonly<Record<string, unknown>>;
  /**
   * Values that must never be written to this send's audit row, whatever key they sit under: an
   * assistant passes a confirmed tool call's declared secret inputs (an API key the user typed).
   * `AuditBehavior` replaces each with `[REDACTED]` in the details and the error message. Absent or
   * empty changes nothing.
   */
  readonly secrets?: readonly string[];
}
