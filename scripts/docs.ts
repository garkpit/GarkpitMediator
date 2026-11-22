#!/usr/bin/env bun
// Keeps the documentation true. `check` proves it against the source; `write` regenerates the files
// that are built from other files (llms.txt, llms-full.txt, the diagrams, embedded snippets).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { doorsSvg, pipelineSvg } from '../site/diagrams';
import { exportsOf, packageSubpaths } from './lib/exports';
import { DOCS_DIR, GUIDES, guidePath, PROJECT, REPO } from './lib/manifest';
import { codeBlocks, headings, linkTargets, proseOnly } from './lib/markdown';

const COMMANDS = [
  { name: 'check', what: 'Prove the docs against the source: code blocks compile, the API reference matches the exports, links resolve, generated files are current.', example: 'bun run docs:check' },
  { name: 'write', what: 'Regenerate llms.txt, llms-full.txt, the diagrams in docs/images and any embedded snippet.', example: 'bun run docs' },
  { name: 'help', what: 'Show this list.', example: 'bun scripts/docs.ts help' }
] as const;

/** Words that read as filler or hype. Prose in the docs and README must not use them. */
const BANNED = ['delve', 'seamless', 'seamlessly', 'unlock', 'supercharge', 'game-changer', 'game-changing', 'fast-paced', 'elevate', 'revolutionise', 'revolutionize', 'cutting-edge', 'next-level', 'world-class', 'empower', 'unleash', 'effortless', 'effortlessly', 'leverage', 'robust', 'pivotal', 'tapestry', 'testament'];

const read = (path: string) => readFileSync(path, 'utf8');
const rel = (path: string) => relative(REPO, path);

/** Every Markdown file the checks cover: the guides, the docs index, the READMEs. */
function markdownFiles(): string[] {
  return [
    ...readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md')).map((f) => join(DOCS_DIR, f)),
    join(REPO, 'README.md'),
    join(REPO, 'llms.txt'),
    join(REPO, 'examples', 'notes', 'README.md')
  ].filter(existsSync);
}

// ---------- generated files ----------

function llmsIndex(): string {
  const lines = [
    `# ${PROJECT.name} (${PROJECT.packageName})`,
    '',
    `> ${PROJECT.summary}`,
    '',
    `Source: ${PROJECT.repoUrl} (MIT). There is no npm package: the source is copied into a project. The whole manual as one file: [llms-full.txt](llms-full.txt).`,
    '',
    '## Guides',
    '',
    ...GUIDES.map((g) => `- [${g.title}](docs/${g.slug}.md): ${g.summary}`),
    '',
    '## For coding agents',
    '',
    '- [AGENTS.md snippet](docs/snippets/AGENTS.md): rules to paste into a project that uses the mediator, so agents add features the same way every time.',
    '- [Cheat sheet](docs/cheatsheet/GarkpitMediator-CheatSheet.md): install, the API, recipes and gotchas on one page.',
    '',
    '## Example',
    '',
    '- [examples/notes](examples/notes/README.md): a runnable app with four features, an HTTP door, a chat-assistant door and an MCP door sharing one pipeline.',
    ''
  ];
  return lines.join('\n');
}

function llmsFull(): string {
  const parts = [
    `# ${PROJECT.name} (${PROJECT.packageName}): the complete manual`,
    '',
    `> ${PROJECT.summary}`,
    '',
    `Source: ${PROJECT.repoUrl} (MIT). This file is every guide joined together, generated from docs/*.md.`,
    ''
  ];
  for (const guide of GUIDES) {
    // Hidden check preludes are for the compiler, not for readers.
    const body = read(guidePath(guide.slug)).replace(/<!--[\s\S]*?-->\n?/g, '').trim();
    parts.push('---', '', `<!-- docs/${guide.slug}.md -->`, '', body, '');
  }
  parts.push('---', '', '<!-- docs/snippets/AGENTS.md -->', '', '# The AGENTS.md snippet', '', read(join(DOCS_DIR, 'snippets', 'AGENTS.md')).trim(), '');
  return parts.join('\n');
}

/** Each generated file and what it should contain right now. */
function generated(): Array<{ path: string; want: string }> {
  return [
    { path: join(REPO, 'llms.txt'), want: llmsIndex() },
    { path: join(REPO, 'llms-full.txt'), want: llmsFull() },
    { path: join(DOCS_DIR, 'images', 'pipeline.svg'), want: pipelineSvg('standalone') },
    { path: join(DOCS_DIR, 'images', 'doors.svg'), want: doorsSvg('standalone') }
  ];
}

/** A guide with every `<!-- snippet:path -->` block replaced by that file's current contents. */
function withSnippets(file: string, markdown: string): string {
  const lines = markdown.split('\n');
  for (const block of codeBlocks(markdown).reverse()) {
    if (block.snippet === undefined) continue;
    const source = read(resolve(dirname(file), block.snippet)).replace(/\n$/, '').split('\n');
    const end = lines.findIndex((line, i) => i >= block.line && /^```\s*$/.test(line));
    lines.splice(block.line, end - block.line, ...source);
  }
  return lines.join('\n');
}

function write(): void {
  for (const file of markdownFiles()) {
    const before = read(file);
    const after = withSnippets(file, before);
    if (after !== before) {
      writeFileSync(file, after);
      console.log(`synced snippets in ${rel(file)}`);
    }
  }
  for (const { path, want } of generated()) {
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path) || read(path) !== want) {
      writeFileSync(path, want);
      console.log(`wrote ${rel(path)}`);
    }
  }
  console.log('docs are up to date');
}

// ---------- checks ----------

/** Compiles every `ts` block (unless marked `nocheck`) as its own module against the real source. */
function checkCodeBlocks(problems: string[]): number {
  const work = join(REPO, '.docs-check');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const origin = new Map<string, { file: string; line: number; preludeLines: number }>();
  let count = 0;

  for (const file of markdownFiles()) {
    for (const block of codeBlocks(read(file))) {
      if (block.language !== 'ts' || block.flags.includes('nocheck')) continue;
      count++;
      const name = `${rel(file).replace(/[^\w]+/g, '_')}_L${block.line}.ts`;
      const prelude = block.prelude === '' ? '' : `${block.prelude}\n`;
      // `export {}` makes every block a module, so blocks never see each other's names.
      writeFileSync(join(work, name), `${prelude}${block.code}\nexport {};\n`);
      origin.set(name, { file: rel(file), line: block.line, preludeLines: prelude === '' ? 0 : prelude.split('\n').length - 1 });
    }
  }
  writeFileSync(join(work, 'tsconfig.json'), JSON.stringify({
    extends: '../tsconfig.json',
    compilerOptions: { noUnusedLocals: false, paths: { '@garkpit/mediator': ['../src/index.ts'], '@garkpit/mediator/*': ['../src/*.ts'] } },
    include: ['./*.ts']
  }, null, 2));

  const tsc = Bun.spawnSync([process.execPath, 'x', 'tsc', '--noEmit', '-p', work, '--pretty', 'false'], { cwd: REPO, stdout: 'pipe', stderr: 'pipe' });
  const output = `${tsc.stdout.toString()}${tsc.stderr.toString()}`.trim();
  if (tsc.exitCode !== 0) {
    const seen = new Set<string>();
    for (const line of output.split('\n')) {
      const m = /^\.docs-check\/(\S+?\.ts)\((\d+),\d+\): error (TS\d+: .*)$/.exec(line);
      const from = m && origin.get(m[1]!);
      if (m && from) {
        // Report the line in the Markdown file: the fence line, plus the offset inside the block.
        const inBlock = Number(m[2]) - from.preludeLines;
        const message = inBlock >= 1 ? `${from.file}:${from.line + inBlock} ${m[3]}` : `${from.file}:${from.line} (in the hidden prelude) ${m[3]}`;
        if (!seen.has(message)) problems.push(message);
        seen.add(message);
      } else if (line.trim() !== '') {
        problems.push(`tsc: ${line}`);
      }
    }
  }
  rmSync(work, { recursive: true, force: true });
  return count;
}

/** The API reference names every export, has a heading for nothing that is not one, and lists every subpath. */
async function checkApiReference(problems: string[]): Promise<number> {
  const reference = read(guidePath('api-reference'));
  const exported = [...exportsOf('index'), ...exportsOf('http')].map((e) => e.name);
  for (const name of exported) {
    if (!new RegExp(`^### \`${name}\`$`, 'm').test(reference)) problems.push(`docs/api-reference.md has no "### \`${name}\`" section for the export ${name}.`);
  }
  for (const m of reference.matchAll(/^### `([^`]+)`$/gm)) {
    if (!exported.includes(m[1]!)) problems.push(`docs/api-reference.md documents \`${m[1]}\`, which is not exported from src/index.ts or src/http.ts.`);
  }
  for (const subpath of await packageSubpaths()) {
    if (!reference.includes(`\`${subpath.replace(/^\./, '')}\``) && !reference.includes(`@garkpit/mediator${subpath.slice(1)}`)) {
      problems.push(`docs/api-reference.md does not list the entry point ${subpath} from package.json.`);
    }
  }
  return exported.length;
}

/** Relative links point at files that exist, and #anchors at headings that exist. */
function checkLinks(problems: string[]): number {
  let count = 0;
  for (const file of markdownFiles()) {
    const markdown = read(file);
    for (const target of linkTargets(markdown)) {
      if (/^(https?:|mailto:)/.test(target)) continue;
      count++;
      const [path, anchor] = target.split('#') as [string, string | undefined];
      const resolved = path === '' ? file : resolve(dirname(file), path);
      if (!existsSync(resolved)) {
        problems.push(`${rel(file)} links to ${target}, but ${rel(resolved)} does not exist.`);
        continue;
      }
      if (anchor !== undefined && resolved.endsWith('.md') && !headings(read(resolved)).some((h) => h.id === anchor)) {
        problems.push(`${rel(file)} links to ${target}, but ${rel(resolved)} has no heading with the id "${anchor}".`);
      }
    }
  }
  return count;
}

function checkManifest(problems: string[]): void {
  const listed = new Set(GUIDES.map((g) => `${g.slug}.md`));
  const present = readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md');
  for (const file of present) if (!listed.has(file)) problems.push(`docs/${file} is not listed in scripts/lib/manifest.ts.`);
  for (const guide of GUIDES) {
    if (!existsSync(guidePath(guide.slug))) {
      problems.push(`scripts/lib/manifest.ts lists ${guide.slug}, but docs/${guide.slug}.md does not exist.`);
      continue;
    }
    const first = headings(read(guidePath(guide.slug)))[0];
    if (first?.level !== 1) problems.push(`docs/${guide.slug}.md must start with a "# " title.`);
  }
  const index = existsSync(join(DOCS_DIR, 'README.md')) ? read(join(DOCS_DIR, 'README.md')) : '';
  for (const guide of GUIDES) if (!index.includes(`(${guide.slug}.md)`)) problems.push(`docs/README.md does not link to ${guide.slug}.md.`);
}

function checkWording(problems: string[]): void {
  for (const file of markdownFiles()) {
    const prose = proseOnly(read(file)).toLowerCase();
    for (const word of BANNED) {
      if (new RegExp(`\\b${word}\\b`).test(prose)) problems.push(`${rel(file)} uses "${word}". Say the plain thing instead.`);
    }
    const dashes = (prose.match(/—/g) ?? []).length;
    if (dashes > 2) problems.push(`${rel(file)} has ${dashes} em-dashes; two a page is the limit.`);
  }
}

function checkGenerated(problems: string[]): void {
  for (const { path, want } of generated()) {
    if (!existsSync(path) || read(path) !== want) problems.push(`${rel(path)} is out of date. Fix: bun run docs`);
  }
  for (const file of markdownFiles()) {
    if (withSnippets(file, read(file)) !== read(file)) problems.push(`${rel(file)} has an embedded snippet that differs from its source file. Fix: bun run docs`);
  }
}

async function check(): Promise<boolean> {
  const problems: string[] = [];
  const blocks = checkCodeBlocks(problems);
  const names = await checkApiReference(problems);
  const links = checkLinks(problems);
  checkManifest(problems);
  checkWording(problems);
  checkGenerated(problems);
  if (problems.length > 0) {
    console.error(`docs check failed (${problems.length}):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    return false;
  }
  console.log(`docs check passed: ${blocks} code blocks compile, ${names} exports documented, ${links} links resolve, generated files current`);
  return true;
}

function help(): string {
  return `docs: keep the documentation true\n\nUsage\n  bun scripts/docs.ts <command>\n\nCommands\n${COMMANDS.map((c) => `  ${c.name.padEnd(6)} ${c.what}\n         example: ${c.example}`).join('\n')}\n\nExit codes: 0 done, 1 a check failed, 2 usage error.\n`;
}

if (import.meta.main) {
  const [command] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help' || command === '-h') process.stdout.write(help());
  else if (command === 'write') write();
  else if (command === 'check') process.exit((await check()) ? 0 : 1);
  else {
    const hint = COMMANDS.map((c) => c.name).find((name) => name[0] === command[0]);
    console.error(`Unknown command "${command}".${hint ? ` Did you mean "${hint}"?` : ''} Run "bun scripts/docs.ts help" for the list.`);
    process.exit(2);
  }
}

export { check, generated, llmsFull, llmsIndex };
