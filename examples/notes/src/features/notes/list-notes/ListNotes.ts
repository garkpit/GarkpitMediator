import { Query } from '@garkpit/mediator';
import type { Note } from '../../../store';

/** List every note, most recently changed first. */
export class ListNotes extends Query<Note[]> {
  static parse(_input: unknown): ListNotes {
    return new ListNotes();
  }
}
