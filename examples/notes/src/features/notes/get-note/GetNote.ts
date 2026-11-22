import { Query } from '@garkpit/mediator';
import { requireString } from '../../../errors';
import type { Note } from '../../../store';

/** Read one note by id. */
export class GetNote extends Query<Note> {
  constructor(readonly id: string) {
    super();
  }

  static parse(input: unknown): GetNote {
    return new GetNote(requireString(input, 'id'));
  }
}
