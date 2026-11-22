import type { Handler } from '@garkpit/mediator';
import { NotFoundError } from '../../../errors';
import type { Note, NotesStore } from '../../../store';
import type { RenameNote } from './RenameNote';

export class RenameNoteHandler implements Handler<RenameNote, Note> {
  constructor(private readonly store: NotesStore) {}

  async handle(command: RenameNote): Promise<Note> {
    const note = await this.store.update(command.id, { title: command.title });
    if (!note) throw new NotFoundError('Note', command.id);
    return note;
  }
}
