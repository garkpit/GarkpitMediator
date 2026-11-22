import { expect, test } from 'bun:test';
import { createApp } from '../../../app';
import { NotFoundError } from '../../../errors';
import { CreateNote } from '../create-note/CreateNote';
import { GetNote } from './GetNote';

test('GetNote returns the note, writes no audit row, and fails with NotFoundError for an unknown id', async () => {
  const app = createApp();
  const { id } = await app.mediator.send(new CreateNote('Read me', 'body'), { actor: 'priya' });
  const rowsBefore = app.auditLog.length;
  expect(await app.mediator.send(new GetNote(id), { actor: 'priya' })).toMatchObject({ id, title: 'Read me' });
  expect(app.auditLog.length).toBe(rowsBefore);
  expect(await app.mediator.send(new GetNote('n404')).catch((e: unknown) => e)).toBeInstanceOf(NotFoundError);
});
