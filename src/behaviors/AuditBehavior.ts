import { randomUUID } from 'node:crypto';
import type { LogEntry } from '../log-types';
import type { AuditEntry } from '../audit-types';
import { redactSecrets as defaultRedactSecrets } from '../redactSecrets';
import { isAuditable } from '../HasAuditInfo';
import type { AuditInfo } from '../HasAuditInfo';
import type { Next, PipelineBehavior } from '../PipelineBehavior';
import type { Request } from '../Request';
import type { RequestContext } from '../RequestContext';

/**
 * Persists one audit row. `info` is the request's own `auditInfo()`, so an app with extra audit
 * dimensions (declared on its `AuditInfo` extension) adds them to the row it stores.
 */
export type AuditWriter<TInfo extends AuditInfo = AuditInfo> = (entry: AuditEntry, info: TInfo) => Promise<void>;
export type AuditLogWriter<TInfo extends AuditInfo = AuditInfo> = (entry: LogEntry, info: TInfo) => Promise<void>;
export type AuditErrorMapper = (error: unknown) => { code: string };
export type SecretsRedactor = (
  input: Record<string, unknown>
) => Record<string, unknown>;
/** Where the behavior reports a writer that threw. Defaults to `console.error`. */
export type AuditFailureReporter = (message: string, context: Record<string, unknown>) => void;

export interface AuditBehaviorOptions<TInfo extends AuditInfo = AuditInfo> {
  appendEntry: AuditWriter<TInfo>;
  /** Mirror each audit row into the app's generic log; needs `logSource` as well. */
  appendLogEntry?: AuditLogWriter<TInfo>;
  /** The app's own name for this source in its log (`LogEntry.source`). */
  logSource?: string;
  mapError: AuditErrorMapper;
  redactSecrets?: SecretsRedactor;
  /**
   * Actor used when the RequestContext carries none (e.g. a direct test invocation). Never an
   * app-specific string baked into the package; defaults to the generic 'system'.
   */
  defaultActor?: string;
  reportFailure?: AuditFailureReporter;
}

/**
 * Writes an audit row for every request that implements `HasAuditInfo`, on success and on failure,
 * without ever letting a failed write change the command's result. `auditInfo()` is read after the
 * handler ran, so a handler can capture pre-state (a snapshot for a diff or a deleted row) first.
 * A request whose `details.columnsPatched` is an empty array changed nothing and is not audited.
 */
export class AuditBehavior<TInfo extends AuditInfo = AuditInfo> implements PipelineBehavior {
  private readonly appendEntry: AuditWriter<TInfo>;
  private readonly appendLogEntry: AuditLogWriter<TInfo> | undefined;
  private readonly logSource: string | undefined;
  private readonly mapError: AuditErrorMapper;
  private readonly redactSecrets: SecretsRedactor;
  private readonly defaultActor: string;
  private readonly reportFailure: AuditFailureReporter;

  constructor(options: AuditBehaviorOptions<TInfo>) {
    this.appendEntry = options.appendEntry;
    this.appendLogEntry = options.appendLogEntry;
    this.logSource = options.logSource;
    this.mapError = options.mapError;
    this.redactSecrets = options.redactSecrets ?? defaultRedactSecrets;
    this.defaultActor = options.defaultActor ?? 'system';
    this.reportFailure = options.reportFailure ?? ((message, context) => console.error(message, context));
  }

  async invoke<TRequest extends Request<TResponse>, TResponse>(
    request: TRequest,
    next: Next<TResponse>,
    ctx?: RequestContext
  ): Promise<TResponse> {
    if (!isAuditable(request)) {
      return next();
    }

    const actor = ctx?.actor ?? this.defaultActor;
    const commandName = request.constructor.name;
    const startedAt = performance.now();

    try {
      // Handler time is intentionally unbounded here; command adapters own their own timeouts.
      const result = await next();
      const info = request.auditInfo() as TInfo;
      // An identical-value PATCH reports `columnsPatched: []`: nothing changed, so no row.
      const cols = (info.details as Record<string, unknown>).columnsPatched;
      if (Array.isArray(cols) && cols.length === 0) {
        return result;
      }
      await this.writeEntry(
        this.buildEntry(info, commandName, actor, 'ok', Math.round(performance.now() - startedAt), ctx),
        info
      );
      return result;
    } catch (error) {
      const mapped = this.mapError(error);
      // Read after the failure too: the handler may have captured pre-state before throwing.
      const info = request.auditInfo() as TInfo;
      await this.writeEntry(
        this.buildEntry(
          info,
          commandName,
          actor,
          'fail',
          Math.round(performance.now() - startedAt),
          ctx,
          {
            code: mapped.code,
            message: error instanceof Error ? error.message : String(error)
          }
        ),
        info
      );
      throw error;
    }
  }

  private buildEntry(
    info: AuditInfo,
    commandName: string,
    actor: string,
    outcome: 'ok' | 'fail',
    durationMs: number,
    ctx?: RequestContext,
    error?: AuditEntry['error']
  ): AuditEntry {
    return {
      schemaVersion: 2,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      actor,
      action: info.action,
      outcome,
      // ctx.audit (per-send extras) lands AFTER the DTO's details and the DTO's details are spread
      // again last, so a caller can annotate but never silently overwrite what the Command reports.
      details: scrubValues(this.redactSecrets(ctx?.audit !== undefined ? { ...info.details, ...ctx.audit, ...info.details } : info.details), ctx?.secrets),
      ...(error !== undefined ? { error: { ...error, message: scrubText(error.message, ctx?.secrets) } } : {}),
      commandName,
      durationMs,
      ...(ctx?.correlationId !== undefined ? { correlationId: ctx.correlationId } : {}),
      ...(info.resourceId !== undefined ? { resourceId: info.resourceId } : {})
    };
  }

  private async writeEntry(entry: AuditEntry, info: TInfo): Promise<void> {
    try {
      // Audit persistence is intentionally unbounded and isolated from the command result.
      await this.appendEntry(entry, info);
    } catch (error) {
      this.reportFailure('[audit] write failed', {
        commandName: entry.commandName,
        outcome: entry.outcome,
        error
      });
    }

    if (this.appendLogEntry !== undefined && this.logSource !== undefined) {
      try {
        await this.appendLogEntry(auditEntryToLogEntry(entry, this.logSource), info);
      } catch (error) {
        this.reportFailure('[audit] generic log write failed', {
          commandName: entry.commandName,
          outcome: entry.outcome,
          error
        });
      }
    }
  }
}

const REDACTED = '[REDACTED]';

/** `text` with every non-empty value of `secrets` replaced (RequestContext.secrets). */
function scrubText(text: string, secrets: readonly string[] | undefined): string {
  let out = text;
  for (const secret of secrets ?? []) if (secret.length > 0) out = out.replaceAll(secret, REDACTED);
  return out;
}

/** Every string inside `details` (keys too), scrubbed of `secrets`. Returns `details` itself when there are none. */
function scrubValues(details: Record<string, unknown>, secrets: readonly string[] | undefined): Record<string, unknown> {
  if (secrets === undefined || !secrets.some((s) => s.length > 0)) return details;
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return scrubText(value, secrets);
    if (Array.isArray(value)) return value.map(walk);
    if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [scrubText(k, secrets), walk(v)]));
    return value;
  };
  return walk(details) as Record<string, unknown>;
}

export function auditEntryToLogEntry(entry: AuditEntry, source: string): LogEntry {
  return {
    schemaVersion: 1,
    timestamp: entry.timestamp,
    level: entry.outcome === 'ok' ? 'info' : 'warn',
    source,
    eventType: 'audit',
    event: entry.action,
    component: entry.commandName,
    actor: entry.actor,
    correlationId: entry.correlationId,
    durationMs: entry.durationMs,
    outcome: entry.outcome,
    error: entry.error,
    details: {
      ...entry.details,
      auditId: entry.id,
      resourceId: entry.resourceId
    }
  };
}
