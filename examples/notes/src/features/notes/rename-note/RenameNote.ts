import { Command, type AuditInfo, type HasAuditInfo, type HasMutexKey } from '@garkpit/mediator';
import { requireString } from '../../../errors';
import type { Note } from '../../../store';

/** Rename a note. Locked per note, so two renames of the same note cannot interleave; audited. */
export class RenameNote extends Command<Note> implements HasMutexKey, HasAuditInfo {
  constructor(readonly id: string, readonly title: string) {
    super();
  }

  mutexKey(): string {
    return `note:${this.id}`;
  }

  auditInfo(): AuditInfo {
    return { action: 'note.rename', resourceId: this.id, details: { title: this.title } };
  }

  static parse(input: unknown): RenameNote {
    return new RenameNote(requireString(input, 'id'), requireString(input, 'title'));
  }
}
