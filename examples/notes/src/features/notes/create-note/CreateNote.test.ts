import { expect, test } from 'bun:test';
import { createApp } from '../../../app';
import { ValidationError } from '../../../errors';
import { CreateNote } from './CreateNote';

test('CreateNote stores the note and writes one audit row naming it', async () => {
  const app = createApp();
  const note = await app.mediator.send(new CreateNote('Shopping', 'Oat milk'), { actor: 'priya' });
  expect(note).toMatchObject({ id: 'n1', title: 'Shopping', body: 'Oat milk' });
  expect(app.auditLog).toMatchObject([{ action: 'note.create', actor: 'priya', outcome: 'ok', resourceId: 'n1', commandName: 'CreateNote' }]);
});

test('CreateNote.parse refuses input without a title and names the field', () => {
  expect(() => CreateNote.parse({ body: 'no title' })).toThrow(ValidationError);
  expect(CreateNote.parse({ title: '  Trimmed  ' })).toMatchObject({ title: 'Trimmed', body: '' });
});
