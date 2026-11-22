import { expect, test } from 'bun:test';
import { MutexHeldError } from '@garkpit/mediator';
import { createApp } from '../../../app';
import { NotFoundError } from '../../../errors';
import { CreateNote } from '../create-note/CreateNote';
import { RenameNote } from './RenameNote';

test('RenameNote renames the note and audits the change', async () => {
  const app = createApp();
  const { id } = await app.mediator.send(new CreateNote('Draft', ''), { actor: 'priya' });
  expect(await app.mediator.send(new RenameNote(id, 'Final'), { actor: 'priya' })).toMatchObject({ id, title: 'Final' });
  expect(app.auditLog.at(-1)).toMatchObject({ action: 'note.rename', outcome: 'ok', resourceId: id, details: { title: 'Final' } });
});

test('two renames of the same note at once: one wins, the other is refused with MutexHeldError', async () => {
  const app = createApp();
  const { id } = await app.mediator.send(new CreateNote('Draft', ''), { actor: 'priya' });
  const [first, second] = await Promise.allSettled([
    app.mediator.send(new RenameNote(id, 'From Priya'), { actor: 'priya' }),
    app.mediator.send(new RenameNote(id, 'From Tomasz'), { actor: 'tomasz' })
  ]);
  expect(first.status).toBe('fulfilled');
  expect(second).toMatchObject({ status: 'rejected' });
  expect((second as PromiseRejectedResult).reason).toBeInstanceOf(MutexHeldError);
});

test('renaming a note that does not exist fails with NotFoundError and a fail audit row', async () => {
  const app = createApp();
  const error = await app.mediator.send(new RenameNote('n404', 'x'), { actor: 'priya' }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(NotFoundError);
  expect(app.auditLog.at(-1)).toMatchObject({ outcome: 'fail', error: { code: 'NOT_FOUND' } });
});
