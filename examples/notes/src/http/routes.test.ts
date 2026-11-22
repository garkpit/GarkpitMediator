import { expect, test } from 'bun:test';
import { createApp } from '../app';
import { BODY_LIMIT_BYTES, createRoutes } from './routes';

const json = (body: unknown) => ({ body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-actor': 'priya' } });

test('the HTTP door wraps every outcome in the ok/fail envelope with the right status', async () => {
  const handle = createRoutes(createApp());

  const created = await handle(new Request('http://notes.test/notes', { method: 'POST', ...json({ title: 'Shopping', body: 'Oat milk' }) }));
  expect(created.status).toBe(201);
  expect(await created.json()).toMatchObject({ ok: true, data: { id: 'n1', title: 'Shopping' } });

  const renamed = await handle(new Request('http://notes.test/notes/n1', { method: 'PATCH', ...json({ title: 'Groceries' }) }));
  expect(await renamed.json()).toMatchObject({ ok: true, data: { id: 'n1', title: 'Groceries' } });

  const listed = await handle(new Request('http://notes.test/notes'));
  expect(await listed.json()).toMatchObject({ ok: true, data: [{ id: 'n1', title: 'Groceries' }] });

  const missing = await handle(new Request('http://notes.test/notes/n404'));
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'Note n404 does not exist.' } });

  const invalid = await handle(new Request('http://notes.test/notes', { method: 'POST', ...json({ body: 'no title' }) }));
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED', details: { field: 'title' } } });
});

test('two renames of one note at the same moment: one 200, one 409 MUTEX_HELD', async () => {
  const handle = createRoutes(createApp());
  await handle(new Request('http://notes.test/notes', { method: 'POST', ...json({ title: 'Draft' }) }));
  const rename = (title: string) => handle(new Request('http://notes.test/notes/n1', { method: 'PATCH', ...json({ title }) }));
  const statuses = (await Promise.all([rename('A'), rename('B')])).map((r) => r.status).sort();
  expect(statuses).toEqual([200, 409]);
});

test('a body over the limit is refused with 413 before it is parsed', async () => {
  const handle = createRoutes(createApp());
  const big = await handle(new Request('http://notes.test/notes', { method: 'POST', ...json({ title: 'x', body: 'y'.repeat(BODY_LIMIT_BYTES) }) }));
  expect(big.status).toBe(413);
  expect(await big.json()).toMatchObject({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE' } });
});

test('GET /capabilities lets the app describe itself', async () => {
  const handle = createRoutes(createApp());
  const body = (await (await handle(new Request('http://notes.test/capabilities'))).json()) as { data: Array<{ name: string; kind: string }> };
  expect(body.data.map((c) => `${c.kind} ${c.name}`)).toEqual(['command CreateNote', 'query GetNote', 'query ListNotes', 'command RenameNote']);
});
