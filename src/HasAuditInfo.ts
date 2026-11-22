/**
 * What a Command reports about itself for the audit log. An app with extra audit dimensions extends
 * this (`interface AppAuditInfo extends AuditInfo { tenant: string | null }`) and reads them in its
 * `AuditBehavior` writers, which receive the request's info next to the entry.
 */
export interface AuditInfo {
  action: string;
  resourceId?: string;
  details: Record<string, unknown>;
}

export interface HasAuditInfo<TInfo extends AuditInfo = AuditInfo> {
  auditInfo(): TInfo;
}

export function isAuditable(req: unknown): req is HasAuditInfo {
  return (
    typeof req === 'object' &&
    req !== null &&
    'auditInfo' in req &&
    typeof (req as { auditInfo: unknown }).auditInfo === 'function'
  );
}
