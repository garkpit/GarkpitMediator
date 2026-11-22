import type { Handler } from '@garkpit/mediator';
import type { Note, NotesStore } from '../../../store';
import type { ListNotes } from './ListNotes';

export class ListNotesHandler implements Handler<ListNotes, Note[]> {
  constructor(private readonly store: NotesStore) {}

  async handle(_query: ListNotes): Promise<Note[]> {
    const notes = await this.store.all();
    return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
  }
}
