#!/usr/bin/env bun
// The cheat sheet: `build` writes docs/cheatsheet/GarkpitMediator-CheatSheet.{md,html,pdf} from
// scripts/cheatsheet/data.ts; `check` reports drift.
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exportsOf } from '../lib/exports';
import { DOCS_DIR } from '../lib/manifest';
import { sheet, type Section } from './data';
import { renderHtml, renderMarkdown } from './render';

export const OUT_DIR = join(DOCS_DIR, 'cheatsheet');
export const FILES = {
  md: join(OUT_DIR, 'GarkpitMediator-CheatSheet.md'),
  html: join(OUT_DIR, 'GarkpitMediator-CheatSheet.html'),
  pdf: join(OUT_DIR, 'GarkpitMediator-CheatSheet.pdf')
};

const COMMANDS = [
  { name: 'build', usage: 'build [--no-pdf]', what: 'Write the Markdown, HTML and PDF from scripts/cheatsheet/data.ts.', flags: [['--no-pdf', 'Skip the PDF (no Chrome needed).']], example: 'bun run cheatsheet' },
  { name: 'check', usage: 'check', what: 'Exit 1 if the Markdown or HTML differ from what build would write, the PDF is missing, or the sheet names something the library no longer exports.', flags: [], example: 'bun scripts/cheatsheet/cli.ts check' },
  { name: 'help', usage: 'help [command]', what: 'Show this list, or one command in full.', flags: [], example: 'bun scripts/cheatsheet/cli.ts help build' }
] as const;

function help(name?: string): string {
  const command = COMMANDS.find((c) => c.name === name);
  if (command) {
    const flags = command.flags.map(([flag, text]) => `  ${flag.padEnd(10)} ${text}`).join('\n');
    return `cheatsheet ${command.usage}\n  ${command.what}\n${flags ? `\nFlags\n${flags}\n` : ''}\nExample\n  ${command.example}\n`;
  }
  return `cheatsheet: the GarkpitMediator quick-reference sheet\n\nUsage\n  bun scripts/cheatsheet/cli.ts <command>\n\nCommands\n${COMMANDS.map((c) => `  ${c.name.padEnd(6)} ${c.what}`).join('\n')}\n\nExit codes: 0 done, 1 failed or drift found, 2 usage error.\n`;
}

/** The Chrome binary: CHROME_PATH, else the usual install locations. */
function chromePath(): string | undefined {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  return candidates.find((path): path is string => path !== undefined && path !== '' && existsSync(path));
}

/** Prints the sheet to an A4 PDF with headless Chrome, in a throwaway profile. */
async function printPdf(html: string): Promise<Uint8Array> {
  const chrome = chromePath();
  if (!chrome) throw new Error('no Chrome found for the PDF. Set CHROME_PATH to a Chrome or Chromium binary, or run with --no-pdf.');
  const dir = await mkdtemp(join(tmpdir(), 'mediator-cheatsheet-'));
  try {
    const page = join(dir, 'sheet.html');
    const out = join(dir, 'sheet.pdf');
    await writeFile(page, html);
    const proc = Bun.spawn(
      [chrome, '--headless', '--no-pdf-header-footer', '--no-first-run', '--no-default-browser-check', '--disable-extensions', `--user-data-dir=${join(dir, 'profile')}`, `--print-to-pdf=${out}`, pathToFileURL(page).href],
      { stdout: 'ignore', stderr: 'pipe' }
    );
    const timer = setTimeout(() => proc.kill('SIGKILL'), 60_000);
    const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    clearTimeout(timer);
    if (code !== 0 || !existsSync(out)) throw new Error(`Chrome could not print the PDF (exit ${code}): ${stderr.trim().split('\n').at(-1) ?? 'no output'}`);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function build(pdf: boolean): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const html = renderHtml();
  await writeFile(FILES.md, renderMarkdown());
  await writeFile(FILES.html, html);
  console.log(`wrote ${FILES.md}\nwrote ${FILES.html}`);
  if (!pdf) return;
  const bytes = await printPdf(html);
  await writeFile(FILES.pdf, bytes);
  console.log(`wrote ${FILES.pdf} (${Math.round(bytes.length / 1024)} KB)`);
}

/** What is wrong with the sheet, as a list of plain sentences. Empty means current. */
export async function problems(): Promise<string[]> {
  const found: string[] = [];
  for (const [file, want] of [[FILES.md, renderMarkdown()], [FILES.html, renderHtml()]] as const) {
    const have = await readFile(file, 'utf8').catch(() => '');
    if (have !== want) found.push(`${file} is out of date. Fix: bun run cheatsheet`);
  }
  if (!existsSync(FILES.pdf)) found.push(`${FILES.pdf} is missing. Fix: bun run cheatsheet`);
  const exported = new Set([...exportsOf('index'), ...exportsOf('http')].map((e) => e.name));
  for (const section of sheet.sections as Section[]) {
    if (!sheet.apiSections.includes(section.title)) continue;
    for (const row of section.rows ?? []) {
      if (!exported.has(row.name)) found.push(`The sheet lists \`${row.name}\` under "${section.title}", but the library does not export it. Fix scripts/cheatsheet/data.ts.`);
    }
  }
  return found;
}

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') process.stdout.write(help());
  else if (command === 'help') process.stdout.write(help(rest[0]));
  else if (rest.includes('--help') || rest.includes('-h')) process.stdout.write(help(command));
  else if (command === 'build') {
    const bad = rest.filter((arg) => arg !== '--no-pdf');
    if (bad.length > 0) {
      console.error(`Unknown flag "${bad[0]}" for build. Flags: --no-pdf. Example: bun scripts/cheatsheet/cli.ts build --no-pdf`);
      process.exit(2);
    }
    await build(!rest.includes('--no-pdf')).catch((error: unknown) => {
      console.error(`build failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
  } else if (command === 'check') {
    const found = await problems();
    if (found.length > 0) {
      console.error(`cheat sheet check failed:\n${found.map((p) => `  - ${p}`).join('\n')}`);
      process.exit(1);
    }
    console.log('cheat sheet is up to date');
  } else {
    const hint = COMMANDS.map((c) => c.name).find((name) => name[0] === command[0]);
    console.error(`Unknown command "${command}".${hint ? ` Did you mean "${hint}"?` : ''} Run "bun scripts/cheatsheet/cli.ts help" for the list.`);
    process.exit(2);
  }
}
