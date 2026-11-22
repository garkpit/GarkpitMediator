#!/usr/bin/env bun
// The notes example's command line: a narrated tour, a local server, or the MCP door on stdio.
import { AssistantDoor } from './src/agent/assistant';
import { handleMcpMessage } from './src/agent/mcp';
import { createApp } from './src/app';
import { createRoutes } from './src/http/routes';

const COMMANDS = [
  { name: 'tour', usage: 'tour', what: 'Walk through every part in one process and print what happens. Needs no port.', flags: [], example: 'bun run example' },
  { name: 'serve', usage: 'serve [--port <n>]', what: 'Serve the HTTP door on 127.0.0.1 until you press Ctrl-C.', flags: [['--port <n>', 'Port to listen on. Default: the PORT environment variable, else 4400.']], example: 'bun examples/notes/main.ts serve --port 4400' },
  { name: 'mcp', usage: 'mcp', what: 'Speak the MCP door over stdin and stdout, one JSON message per line, for an MCP client to launch.', flags: [], example: 'bun examples/notes/main.ts mcp' },
  { name: 'help', usage: 'help [command]', what: 'Show this list, or one command in full.', flags: [], example: 'bun examples/notes/main.ts help serve' }
] as const;

const colour = process.stdout.isTTY && !process.env.NO_COLOR;
const bold = (s: string) => (colour ? `\x1b[1m${s}\x1b[0m` : s);
const dim = (s: string) => (colour ? `\x1b[2m${s}\x1b[0m` : s);
const accent = (s: string) => (colour ? `\x1b[38;5;173m${s}\x1b[0m` : s);

function help(name?: string): string {
  const command = COMMANDS.find((c) => c.name === name);
  if (command) {
    const flags = command.flags.map(([flag, text]) => `  ${flag.padEnd(12)} ${text}`).join('\n');
    return `${bold(`notes ${command.usage}`)}\n  ${command.what}\n${flags ? `\nFlags\n${flags}\n` : ''}\nExample\n  ${command.example}\n`;
  }
  const rows = COMMANDS.map((c) => `  ${c.name.padEnd(7)} ${c.what}`).join('\n');
  return `${bold('notes')}: the @garkpit/mediator example app\n\nUsage\n  bun examples/notes/main.ts <command>\n\nCommands\n${rows}\n\nRun "help <command>" for flags and an example.\nExit codes: 0 done, 1 failed, 2 usage error.\n`;
}

/** The closest known word, for "did you mean". */
function closest(word: string, options: readonly string[]): string | undefined {
  const distance = (a: string, b: string): number => {
    const row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0]!;
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const current = row[j]!;
        row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = current;
      }
    }
    return row[b.length]!;
  };
  const best = options.map((o) => [o, distance(word, o)] as const).sort((a, b) => a[1] - b[1])[0];
  return best && best[1] <= 2 ? best[0] : undefined;
}

async function tour(): Promise<void> {
  const lines: string[] = [];
  const app = createApp({ log: (line) => lines.push(line) });
  const handle = createRoutes(app);
  const step = (title: string) => console.log(`\n${accent('●')} ${bold(title)}`);
  const show = async (label: string, response: Response) => console.log(`  ${dim(label.padEnd(34))} ${response.status}  ${JSON.stringify(await response.json())}`);
  const post = (path: string, body: unknown, actor: string, method = 'POST') =>
    handle(new Request(`http://notes.example${path}`, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-actor': actor } }));

  step('The app describes itself: every capability is a named Command or Query');
  console.log(`  ${app.mediator.registeredRequestTypes().join(', ')}`);

  step('A person creates a note through the HTTP door');
  await show('POST /notes', await post('/notes', { title: 'Shopping', body: 'Oat milk, coffee' }, 'priya'));

  step('Two people rename the same note at the same moment: the lock lets one through');
  const [a, b] = await Promise.all([post('/notes/n1', { title: 'Groceries' }, 'priya', 'PATCH'), post('/notes/n1', { title: 'Food shop' }, 'tomasz', 'PATCH')]);
  await show('PATCH /notes/n1  (priya)', a);
  await show('PATCH /notes/n1  (tomasz)', b);

  step('Failures use the same envelope, with a status taken from the error code');
  await show('GET /notes/n404', await handle(new Request('http://notes.example/notes/n404')));
  await show('POST /notes  (no title)', await post('/notes', { body: 'untitled' }, 'priya'));
  await show('POST /notes  (20 KB body)', await post('/notes', { title: 'Big', body: 'x'.repeat(20_000) }, 'priya'));

  step('An assistant uses the same capabilities: reads run, changes wait for a person');
  const door = new AssistantDoor(app.mediator);
  console.log(`  ${dim('tools it is given'.padEnd(34))} ${door.toolDefinitions().map((t) => t.name).join(', ')}`);
  console.log(`  ${dim('call ListNotes'.padEnd(34))} ${JSON.stringify(await door.call('ListNotes', {}, { actor: 'priya' }))}`);
  const outcome = await door.call('RenameNote', { id: 'n1', title: 'Weekly shop' }, { actor: 'priya' });
  console.log(`  ${dim('call RenameNote'.padEnd(34))} ${JSON.stringify(outcome)}`);
  if (outcome.status === 'needs-confirmation') {
    console.log(`  ${dim('priya confirms'.padEnd(34))} ${JSON.stringify(await door.confirm(outcome.proposal.id, { actor: 'priya' }))}`);
  }

  step('An outside agent uses them over MCP');
  const listed = (await handleMcpMessage(app, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { actor: 'mcp-client' })) as { result: { tools: Array<{ name: string }> } };
  console.log(`  ${dim('tools/list'.padEnd(34))} ${listed.result.tools.map((t) => t.name).join(', ')}`);
  const called = await handleMcpMessage(app, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'CreateNote', arguments: { title: 'Left by an agent' } } }, { actor: 'mcp-client' });
  console.log(`  ${dim('tools/call CreateNote'.padEnd(34))} ${JSON.stringify(called).replace(/\\n\s*/g, ' ')}`);

  step('Every change, whoever or whatever made it, left one audit row');
  for (const row of app.auditLog) {
    const via = typeof row.details.via === 'string' ? row.details.via : 'http';
    console.log(`  ${row.outcome.padEnd(4)} ${row.action.padEnd(12)} ${dim('by')} ${row.actor.padEnd(10)} ${dim('via')} ${via.padEnd(14)} ${row.resourceId ?? ''}`);
  }

  step('And every request, read or write, logged one line');
  for (const line of lines) console.log(`  ${dim(line.replace(/\(\d+\.\dms\)/, '(…ms)'))}`);
  console.log('');
}

function serve(args: string[]): void {
  let port = Number(process.env.PORT ?? 4400);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1] !== undefined) port = Number(args[++i]);
    else {
      console.error(`Unknown flag "${args[i]}" for serve. Flags: --port <n>. Example: bun examples/notes/main.ts serve --port 4400`);
      process.exit(2);
    }
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error('The port must be a whole number from 0 to 65535. Example: bun examples/notes/main.ts serve --port 4400');
    process.exit(2);
  }
  const app = createApp({ log: (line, error) => console.log(line, error ?? '') });
  // Loopback only: this is an example with no sign-in, so it must not be reachable from other machines.
  const server = Bun.serve({ hostname: '127.0.0.1', port, fetch: createRoutes(app) });
  console.log(`notes example listening on http://127.0.0.1:${server.port}\n  try: curl -s http://127.0.0.1:${server.port}/capabilities\n  stop: Ctrl-C`);
}

async function mcpOverStdio(): Promise<void> {
  const app = createApp();
  const decoder = new TextDecoder();
  let buffered = '';
  for await (const chunk of Bun.stdin.stream()) {
    buffered += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffered.indexOf('\n')) !== -1) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (line === '') continue;
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
        continue;
      }
      const reply = await handleMcpMessage(app, message, { actor: 'mcp-client' });
      if (reply !== null) process.stdout.write(`${JSON.stringify(reply)}\n`);
    }
  }
}

const [command, ...rest] = process.argv.slice(2);
if (!command || command === '--help' || command === '-h') process.stdout.write(help());
else if (command === 'help') process.stdout.write(help(rest[0]));
else if (rest.includes('--help') || rest.includes('-h')) process.stdout.write(help(command));
else if (command === 'tour') await tour();
else if (command === 'serve') serve(rest);
else if (command === 'mcp') await mcpOverStdio();
else {
  const hint = closest(command, COMMANDS.map((c) => c.name));
  console.error(`Unknown command "${command}".${hint ? ` Did you mean "${hint}"?` : ''} Run "bun examples/notes/main.ts help" for the list.`);
  process.exit(2);
}
