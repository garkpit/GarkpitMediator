import { Command, type AuditInfo, type HasAuditInfo } from '@garkpit/mediator';
import { requireString } from '../../../errors';
import type { Note } from '../../../store';

/** Create a note. Audited; no lock needed, because nothing else can touch a note that does not exist yet. */
export class CreateNote extends Command<Note> implements HasAuditInfo {
  /** Set by the handler once the note exists, so the audit row can name it. */
  createdId: string | undefined;

  constructor(readonly title: string, readonly body: string) {
    super();
  }

  auditInfo(): AuditInfo {
    return {
      action: 'note.create',
      ...(this.createdId !== undefined ? { resourceId: this.createdId } : {}),
      details: { title: this.title }
    };
  }

  /** The one place untyped input becomes a CreateNote. The HTTP route and the agent doors both use it. */
  static parse(input: unknown): CreateNote {
    const body = typeof input === 'object' && input !== null && 'body' in input ? requireString(input, 'body', 10_000) : '';
    return new CreateNote(requireString(input, 'title'), body);
  }
}
