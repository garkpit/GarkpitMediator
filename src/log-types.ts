// The generic log-entry shape `AuditBehavior` can mirror an audit row into. The app owns everything
// app-specific: its list of sources (`source` is a plain string here), any extra dimensions it
// records (tenant, instance, agent), and how it queries and pages its logs.

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const LOG_EVENT_TYPES = ['audit', 'error', 'request', 'system', 'agent'] as const;
export type LogEventType = (typeof LOG_EVENT_TYPES)[number];

export type LogOutcome = 'ok' | 'fail' | 'denied' | 'unknown';

export interface LogErrorDetails {
  name?: string;
  message: string;
  code?: string;
  stack?: string;
}

export interface LogEntry {
  schemaVersion: 1;
  timestamp: string;
  level: LogLevel;
  /** Where the entry came from, in the app's own vocabulary (e.g. 'web', 'worker'). */
  source: string;
  eventType: LogEventType;
  event: string;
  component?: string;
  message?: string;
  actor?: string;
  userId?: string;
  requestId?: string;
  correlationId?: string;
  durationMs?: number;
  outcome?: LogOutcome;
  error?: LogErrorDetails;
  details?: Record<string, unknown>;
  raw?: string;
}
