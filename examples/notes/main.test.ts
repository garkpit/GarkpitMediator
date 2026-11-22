import { expect, test } from 'bun:test';
import { join } from 'node:path';

const main = join(import.meta.dir, 'main.ts');
const run = (...args: string[]) => {
  const result = Bun.spawnSync([process.execPath, main, ...args], { env: { ...process.env, NO_COLOR: '1' }, stdout: 'pipe', stderr: 'pipe' });
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() };
};

test('the tour runs to the end and shows the lock, the envelope, both agent doors and the audit trail', () => {
  const { code, out } = run('tour');
  expect(code).toBe(0);
  expect(out).toContain('CreateNote, GetNote, ListNotes, RenameNote');
  expect(out).toMatch(/PATCH \/notes\/n1 +\(priya\) +200/);
  expect(out).toMatch(/PATCH \/notes\/n1 +\(tomasz\) +409 .*MUTEX_HELD/);
  expect(out).toMatch(/POST \/notes +\(20 KB body\) +413/);
  expect(out).toContain('"status":"needs-confirmation"');
  expect(out).toMatch(/ok +note\.rename +by priya +via assistant-chat n1/);
  expect(out).toMatch(/ok +note\.create +by mcp-client via mcp +n2/);
});

test('the command line is friendly: bare run and --help list commands, a typo gets a suggestion', () => {
  expect(run().out).toContain('Commands');
  expect(run('--help').code).toBe(0);
  expect(run('help', 'serve').out).toContain('--port');
  const typo = run('tuor');
  expect(typo.code).toBe(2);
  expect(typo.err).toContain('Did you mean "tour"?');
});

test('the MCP door answers over standard input and output, one JSON message per line', async () => {
  const child = Bun.spawn([process.execPath, main, 'mcp'], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
  child.stdin.end();
  const replies = (await new Response(child.stdout).text()).trim().split('\n').map((line) => JSON.parse(line) as { id: number; result: { tools?: Array<{ name: string }> } });
  expect(await child.exited).toBe(0);
  expect(replies.map((r) => r.id)).toEqual([1, 2]);
  expect(replies[1]!.result.tools!.map((t) => t.name)).toEqual(['CreateNote', 'GetNote', 'ListNotes', 'RenameNote']);
});
