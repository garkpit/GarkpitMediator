import { Mediator } from './Mediator';
import type { PipelineBehavior } from './PipelineBehavior';

export * from './Request';
export * from './Handler';
export * from './PipelineBehavior';
export {
  Mediator,
  HandlerNotRegisteredError,
  HandlerAlreadyRegisteredError,
  BehaviorAlreadyRegisteredError
} from './Mediator';
export type { MediatorPort, RegisterOptions } from './Mediator';
export type { RequestContext } from './RequestContext';
export { LoggingBehavior } from './behaviors/LoggingBehavior';
export type { MediatorLogSink } from './behaviors/LoggingBehavior';
export { MutexBehavior } from './behaviors/MutexBehavior';
export { AuditBehavior, auditEntryToLogEntry } from './behaviors/AuditBehavior';
export type {
  AuditBehaviorOptions,
  AuditErrorMapper,
  AuditFailureReporter,
  AuditLogWriter,
  AuditWriter,
  SecretsRedactor
} from './behaviors/AuditBehavior';
export type { AuditEntry, AuditOutcome } from './audit-types';
export { LOG_LEVELS, LOG_EVENT_TYPES } from './log-types';
export type { LogEntry, LogErrorDetails, LogEventType, LogLevel, LogOutcome } from './log-types';
export { isAuditable } from './HasAuditInfo';
export type { AuditInfo, HasAuditInfo } from './HasAuditInfo';
export { isMutexed } from './HasMutexKey';
export type { HasMutexKey } from './HasMutexKey';
export { MutexHeldError } from './MutexHeldError';
export { redactSecrets } from './redactSecrets';

export interface CreateMediatorOptions {
  /**
   * Pipeline behaviors, outermost first. The consumer constructs them (`new MutexBehavior()`,
   * `new AuditBehavior(...)`, `new LoggingBehavior()`) and passes the same instances here.
   *
   * Process-scoped state (the MutexBehavior's held-key set, the database pool behind an
   * AuditBehavior writer) must outlive any one mediator: construct stateful behaviors once at module
   * scope and reuse them. createMediator only wires the pipeline; it owns no process-scoped state.
   */
  behaviors?: readonly PipelineBehavior[];
}

export function createMediator(options: CreateMediatorOptions = {}): Mediator {
  const mediator = new Mediator();
  for (const behavior of options.behaviors ?? []) {
    mediator.use(behavior);
  }
  return mediator;
}
