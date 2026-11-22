// The audit row `AuditBehavior` builds. App-specific dimensions (a tenant, an instance) are not
// fields here: the app declares them on its own `AuditInfo` extension and adds them in its writer,
// which receives the request's `AuditInfo` next to the entry. Querying and paging the audit log is
// the app's business too.

export type AuditOutcome = 'ok' | 'fail' | 'denied';

export interface AuditEntry {
  schemaVersion: 2;
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  outcome: AuditOutcome;
  details: Record<string, unknown>;
  error?: { code: string; message: string };

  correlationId?: string;
  commandName?: string;
  durationMs?: number;
  resourceId?: string;
}
