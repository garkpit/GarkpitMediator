// The notes feature's registrations: one line per slice. Adding a feature adds a folder and a line here.
import type { MediatorPort } from '@garkpit/mediator';
import type { NotesStore } from '../../store';
import { CreateNote } from './create-note/CreateNote';
import { CreateNoteHandler } from './create-note/CreateNoteHandler';
import { GetNote } from './get-note/GetNote';
import { GetNoteHandler } from './get-note/GetNoteHandler';
import { ListNotes } from './list-notes/ListNotes';
import { ListNotesHandler } from './list-notes/ListNotesHandler';
import { RenameNote } from './rename-note/RenameNote';
import { RenameNoteHandler } from './rename-note/RenameNoteHandler';

export function registerNotes(mediator: MediatorPort, store: NotesStore): void {
  mediator.register(CreateNote, new CreateNoteHandler(store));
  mediator.register(GetNote, new GetNoteHandler(store));
  mediator.register(ListNotes, new ListNotesHandler(store));
  mediator.register(RenameNote, new RenameNoteHandler(store));
}

export { CreateNote, GetNote, ListNotes, RenameNote };
