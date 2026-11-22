import { expect, test } from 'bun:test';
import { createApp } from '../app';
import { ValidationError } from '../errors';
import { AssistantDoor } from './assistant';
import { catalogue } from './catalogue';
import { handleMcpMessage } from './mcp';

test('parity: the catalogue lists exactly the requests the mediator has handlers for', () => {
  const app = createApp();
  expect(catalogue.map((t) => t.name).sort()).toEqual([...app.mediator.registeredRequestTypes()]);
});

test('kinds come from the classes: Commands are commands, Queries are queries', () => {
  expect(Object.fromEntries(catalogue.map((t) => [t.name, t.kind]))).toEqual({
    CreateNote: 'command', GetNote: 'query', ListNotes: 'query', RenameNote: 'command'
  });
});

test('chat door: a query runs at once; a command waits for a person, then is audited as theirs', async () => {
  const app = createApp();
  const door = new AssistantDoor(app.mediator);
  expect(await door.call('ListNotes', {}, { actor: 'priya' })).toEqual({ status: 'done', data: [] });

  const outcome = await door.call('CreateNote', { title: 'From the assistant' }, { actor: 'priya' });
  expect(outcome).toMatchObject({ status: 'needs-confirmation', proposal: { id: 'p1', tool: 'CreateNote' } });
  expect(await app.store.all()).toEqual([]);
  expect(app.auditLog).toEqual([]);

  expect(await door.confirm('p1', { actor: 'priya' })).toMatchObject({ title: 'From the assistant' });
  expect(app.auditLog).toMatchObject([{ actor: 'priya', action: 'note.create', details: { via: 'assistant-chat', proposalId: 'p1' } }]);
  // A proposal is decided once.
  expect(await door.confirm('p1', { actor: 'priya' }).catch((e: unknown) => e)).toBeInstanceOf(ValidationError);
});

test('chat door: bad input is refused before anyone is asked, and a rejected proposal sends nothing', async () => {
  const app = createApp();
  const door = new AssistantDoor(app.mediator);
  expect(await door.call('CreateNote', {}, { actor: 'priya' }).catch((e: unknown) => e)).toBeInstanceOf(ValidationError);
  const outcome = await door.call('CreateNote', { title: 'Never mind' }, { actor: 'priya' });
  expect(outcome.status === 'needs-confirmation' && door.reject(outcome.proposal.id)).toBe(true);
  expect(await app.store.all()).toEqual([]);
});

test('MCP door: initialize, tools/list and tools/call speak JSON-RPC over the same pipeline', async () => {
  const app = createApp();
  const ctx = { actor: 'mcp-client' };
  expect(await handleMcpMessage(app, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, ctx))
    .toMatchObject({ id: 1, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } });
  expect(await handleMcpMessage(app, { jsonrpc: '2.0', method: 'notifications/initialized' }, ctx)).toBeNull();

  const listed = (await handleMcpMessage(app, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx)) as { result: { tools: Array<{ name: string; annotations: { readOnlyHint: boolean } }> } };
  expect(listed.result.tools.map((t) => [t.name, t.annotations.readOnlyHint])).toEqual([['CreateNote', false], ['GetNote', true], ['ListNotes', true], ['RenameNote', false]]);

  const created = (await handleMcpMessage(app, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'CreateNote', arguments: { title: 'Via MCP' } } }, ctx)) as { result: { content: Array<{ text: string }>; isError?: boolean } };
  expect(created.result.isError).toBeUndefined();
  expect(JSON.parse(created.result.content[0]!.text)).toMatchObject({ id: 'n1', title: 'Via MCP' });
  expect(app.auditLog).toMatchObject([{ actor: 'mcp-client', action: 'note.create', details: { via: 'mcp' } }]);

  expect(await handleMcpMessage(app, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'GetNote', arguments: { id: 'n404' } } }, ctx))
    .toMatchObject({ result: { isError: true, content: [{ text: 'NOT_FOUND: Note n404 does not exist.' }] } });
  expect(await handleMcpMessage(app, { jsonrpc: '2.0', id: 5, method: 'resources/list' }, ctx)).toMatchObject({ error: { code: -32601 } });
});
