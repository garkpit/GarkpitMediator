import type { Handler } from '@garkpit/mediator';
import type { Note, NotesStore } from '../../../store';
import type { CreateNote } from './CreateNote';

export class CreateNoteHandler implements Handler<CreateNote, Note> {
  constructor(private readonly store: NotesStore) {}

  async handle(command: CreateNote): Promise<Note> {
    const note = await this.store.insert(command.title, command.body);
    command.createdId = note.id;
    return note;
  }
}
