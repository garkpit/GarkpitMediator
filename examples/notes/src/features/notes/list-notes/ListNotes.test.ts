import { expect, test } from 'bun:test';
import { createApp } from '../../../app';
import { CreateNote } from '../create-note/CreateNote';
import { ListNotes } from './ListNotes';

test('ListNotes returns every note', async () => {
  const app = createApp();
  expect(await app.mediator.send(new ListNotes())).toEqual([]);
  await app.mediator.send(new CreateNote('One', ''), { actor: 'priya' });
  await app.mediator.send(new CreateNote('Two', ''), { actor: 'priya' });
  expect((await app.mediator.send(new ListNotes())).map((n) => n.title).sort()).toEqual(['One', 'Two']);
});
