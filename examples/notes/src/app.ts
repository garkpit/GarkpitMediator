// The composition root: the one place that builds the store, the behaviors and the mediator, and
// registers every feature. Everything else receives what it needs from here.
import { AuditBehavior, createMediator, LoggingBehavior, MutexBehavior, type AuditEntry, type Mediator, type MediatorLogSink } from '@garkpit/mediator';
import { toApiError } from './errors';
import { registerNotes } from './features/notes';
import { NotesStore } from './store';

export interface App {
  mediator: Mediator;
  store: NotesStore;
  /** Every audit row written so far. A real app writes these to a database table instead. */
  auditLog: AuditEntry[];
}

export function createApp(options: { log?: MediatorLogSink } = {}): App {
  const store = new NotesStore();
  const auditLog: AuditEntry[] = [];

  // Outermost first. A command refused by the lock never reaches the audit behavior, so a refusal
  // is not an audit row; swap the first two if you want refused attempts recorded as well.
  const mediator = createMediator({
    behaviors: [
      new MutexBehavior(),
      new AuditBehavior({
        appendEntry: async (entry) => { auditLog.push(entry); },
        mapError: (error) => ({ code: toApiError(error).code })
      }),
      new LoggingBehavior(options.log ?? (() => undefined))
    ]
  });

  registerNotes(mediator, store);
  return { mediator, store, auditLog };
}
