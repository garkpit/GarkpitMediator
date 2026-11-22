import type { Handler } from '@garkpit/mediator';
import { NotFoundError } from '../../../errors';
import type { Note, NotesStore } from '../../../store';
import type { GetNote } from './GetNote';

export class GetNoteHandler implements Handler<GetNote, Note> {
  constructor(private readonly store: NotesStore) {}

  async handle(query: GetNote): Promise<Note> {
    const note = await this.store.find(query.id);
    if (!note) throw new NotFoundError('Note', query.id);
    return note;
  }
}
