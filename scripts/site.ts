#!/usr/bin/env bun
// The documentation site: a landing page, every guide as a page, the cheat sheet, llms.txt and the
// raw Markdown, built into dist/site as plain static files. No framework and no network: each page
// carries its own styles, so the folder can be opened from disk or served from any static host.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { AIRES_HTML } from '../site/aires';
import { doorsSvg, pipelineSvg } from '../site/diagrams';
import { landingBody } from '../site/landing';
import { exportsOf } from './lib/exports';
import { escapeHtml } from './lib/highlight';
import { DOCS_DIR, FAVICON, GUIDES, guidePath, PROJECT, REPO } from './lib/manifest';
import { headings, renderMarkdown, type Heading } from './lib/markdown';

const DEFAULT_OUT = join(REPO, 'dist', 'site');
const read = (path: string) => readFileSync(path, 'utf8');
const kit = (file: string) => read(join(REPO, 'site', 'kit', file));

const COMMANDS = [
  { name: 'build', usage: 'build [--out <dir>]', what: 'Build the site as static files.', flags: [['--out <dir>', 'Where to write it. Default: dist/site.']], example: 'bun run site' },
  { name: 'serve', usage: 'serve [--port <n>] [--out <dir>]', what: 'Build the site, then serve it on this machine only until you press Ctrl-C.', flags: [['--port <n>', 'Port to listen on. Default: the PORT environment variable, else 4420.'], ['--out <dir>', 'Where to build it. Default: dist/site.']], example: 'bun run site:serve' },
  { name: 'publish', usage: 'publish --confirm-public [--remote <name>]', what: 'Build the site and push it as one commit to the gh-pages branch, which makes it public once GitHub Pages serves that branch.', flags: [['--confirm-public', 'Required. Says you mean to make the site public.'], ['--remote <name>', 'Git remote to push to. Default: origin.']], example: 'bun scripts/site.ts publish --confirm-public' },
  { name: 'help', usage: 'help [command]', what: 'Show this list, or one command in full.', flags: [], example: 'bun scripts/site.ts help serve' }
] as const;

// ---------- where a repository file lives on the site ----------

const EXAMPLE_README = 'examples/notes/README.md';

/** The site path for a repository file, or undefined when the site does not carry it. */
function sitePath(repoPath: string): string | undefined {
  if (repoPath === 'docs/README.md') return 'docs/index.html';
  if (repoPath === EXAMPLE_README) return 'docs/example-notes.html';
  const guide = /^docs\/([\w-]+)\.md$/.exec(repoPath);
  if (guide && GUIDES.some((g) => g.slug === guide[1])) return `docs/${guide[1]}.html`;
  if (repoPath === 'llms.txt' || repoPath === 'llms-full.txt') return repoPath;
  if (/^docs\/(snippets|cheatsheet|images)\//.test(repoPath)) return repoPath;
  return undefined;
}

/** Rewrites a link written in a Markdown file so it works from that file's page on the site. */
function linkRewriter(sourceRepoPath: string, pageSitePath: string): (target: string) => string {
  return (target) => {
    if (/^(https?:|mailto:|#)/.test(target)) return target;
    const [path, anchor] = target.split('#') as [string, string | undefined];
    const repoPath = posix.normalize(posix.join(posix.dirname(sourceRepoPath), path));
    const onSite = sitePath(repoPath);
    const suffix = anchor !== undefined ? `#${anchor}` : '';
    if (onSite === undefined) return `${PROJECT.repoUrl}/blob/main/${repoPath}${suffix}`;
    return `${posix.relative(posix.dirname(pageSitePath), onSite) || posix.basename(onSite)}${suffix}`;
  };
}

// ---------- the page shell ----------

const MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect class="ring-a" x="1" y="1" width="30" height="30" rx="9" stroke-width="1"/><rect class="ring-b" x="6.5" y="6.5" width="19" height="19" rx="6"/><rect class="core" x="11.5" y="11.5" width="9" height="9" rx="3"/></svg>`;
const KIT_CONFIG = JSON.stringify({ direction: 'clay', accent: 'default', motion: ['fade', 'rise', 'scale', 'cascade', 'count', 'meter', 'draw'] });
const guard = (text: string, tag: 'style' | 'script') => text.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);

interface Page {
  /** Path inside the site, e.g. "docs/behaviors.html". */
  path: string;
  title: string;
  description: string;
  body: string;
  /** Which top-bar link is the current section. */
  section: 'home' | 'docs' | 'example';
}

function shell(page: Page, commit: string): string {
  const root = posix.relative(posix.dirname(page.path), '') || '.';
  const at = (path: string) => `${root}/${path}`;
  const current = (section: Page['section']) => (page.section === section ? ' aria-current="page"' : '');
  return `<!doctype html>
<html lang="en-GB" data-direction="clay" data-theme="dark">
<head>
<meta charset="utf-8">
<script data-page-kit="head">${kit('head.js').trim()}</script>
<style data-page-kit="base">
${guard(kit('base.css'), 'style')}</style>
<style data-page-kit="tokens">
${guard(kit('tokens.css'), 'style')}</style>
<style data-page-kit="direction">
${guard(kit('clay.css'), 'style')}</style>
<style data-page-kit="motion">
${guard(kit('motion.css'), 'style')}</style>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<link rel="icon" href="${FAVICON}">
<style>
${guard(read(join(REPO, 'site', 'site.css')), 'style')}</style>
</head>
<body>
<div class="topbar" data-overlap><div class="topbar-in">
  <a class="brand" href="${at('index.html')}" aria-label="${PROJECT.name} home">${MARK}<span>${PROJECT.name}</span></a>
  <nav class="topnav" aria-label="Site">
    <a href="${at('docs/index.html')}"${current('docs')}>Docs</a>
    <a href="${at('docs/example-notes.html')}"${current('example')} data-wide>Example</a>
    <a href="${at('docs/cheatsheet/GarkpitMediator-CheatSheet.html')}" data-wide>Cheat sheet</a>
    <a href="${PROJECT.repoUrl}">GitHub</a>
  </nav>
  <button type="button" data-theme-toggle></button>
</div></div>
${page.body}
<footer class="colophon"><div class="wrap">
  <p>${PROJECT.packageName} is a small personal project, shared as it is under the <a href="${PROJECT.repoUrl}/blob/main/LICENSE">MIT licence</a>: no warranty, no support and no promise of stability between versions. It is not a product of, or endorsed by, any employer.</p>
  <p>Built from <code>${escapeHtml(commit)}</code>. No trackers, no analytics, no fonts or scripts from other sites. <a href="${at('llms.txt')}">llms.txt</a> · <a href="${PROJECT.repoUrl}">Source</a></p>
</div></footer>
<script type="application/json" id="page-kit-config" data-page-kit="config">${KIT_CONFIG}</script>
<script data-page-kit="runtime">
${guard(kit('page-kit.js'), 'script')}</script>
<script>
${guard(read(join(REPO, 'site', 'client.js')), 'script')}</script>
</body>
</html>
`;
}

// ---------- docs pages ----------

interface DocPage {
  slug: string;
  title: string;
  repoPath: string;
  sitePath: string;
}

const NAV_GROUPS: Array<{ label: string; slugs: string[] }> = [
  { label: 'Start here', slugs: ['getting-started', 'commands-and-queries', 'behaviors', 'http'] },
  { label: 'Growing, with people and with AI', slugs: ['vertical-slices', 'ai-coding-agents', 'agentic-interface'] },
  { label: 'Reference', slugs: ['api-reference', 'faq'] }
];

function sidebar(current: DocPage, onPage: Heading[]): string {
  const item = (slug: string, title: string, file: string) => {
    const isCurrent = current.slug === slug;
    const sections = isCurrent && onPage.length > 1
      ? `<ul class="on-page">${onPage.map((h) => `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join('')}</ul>`
      : '';
    return `<li><a href="${file}"${isCurrent ? ' aria-current="page"' : ''}>${escapeHtml(title)}</a>${sections}</li>`;
  };
  const groups = NAV_GROUPS.map((group) => {
    const items = group.slugs.map((slug) => item(slug, GUIDES.find((g) => g.slug === slug)!.title, `${slug}.html`)).join('');
    return `<p class="nav-label">${escapeHtml(group.label)}</p><ol>${items}</ol>`;
  }).join('');
  const more = `<p class="nav-label">More</p><ol>${item('index', 'All guides', 'index.html')}${item('example-notes', 'The example app', 'example-notes.html')}<li><a href="cheatsheet/GarkpitMediator-CheatSheet.html">Cheat sheet</a></li><li><a href="snippets/AGENTS.md">AGENTS.md snippet</a></li></ol>`;
  return `<details class="docs-nav" open><summary>Guides</summary><nav aria-label="Guides">${groups}${more}</nav></details>`;
}

function docPage(doc: DocPage, markdown: string): Page {
  const all = headings(markdown);
  const html = renderMarkdown(markdown, {
    rewriteLink: linkRewriter(doc.repoPath, doc.sitePath),
    inlineImage: (src) => (src.endsWith('pipeline.svg') ? pipelineSvg('tokens') : src.endsWith('doors.svg') ? doorsSvg('tokens') : undefined)
  });

  const order = GUIDES.findIndex((g) => g.slug === doc.slug);
  const previous = order > 0 ? GUIDES[order - 1] : undefined;
  const next = order >= 0 && order < GUIDES.length - 1 ? GUIDES[order + 1] : doc.slug === 'index' ? GUIDES[0] : undefined;
  const pager = previous || next
    ? `<nav class="pager" aria-label="More guides">${previous ? `<a href="${previous.slug}.html"><small>Previous</small><strong>${escapeHtml(previous.title)}</strong></a>` : ''}${next ? `<a href="${next.slug}.html" data-next><small>Next</small><strong>${escapeHtml(next.title)}</strong></a>` : ''}</nav>`
    : '';
  const source = `<p class="edit-note">This page is <a href="${PROJECT.repoUrl}/blob/main/${doc.repoPath}">${doc.repoPath}</a> in the repository${doc.repoPath.startsWith('docs/') ? `, also available as <a href="${posix.basename(doc.repoPath)}">plain Markdown</a>` : ''}.</p>`;

  const firstParagraph = /<p>([\s\S]*?)<\/p>/.exec(html)?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() ?? PROJECT.summary;
  return {
    path: doc.sitePath,
    title: `${doc.title} · ${PROJECT.name}`,
    description: firstParagraph.length > 200 ? `${firstParagraph.slice(0, 197)}…` : firstParagraph,
    section: doc.slug === 'example-notes' ? 'example' : 'docs',
    body: `<main class="docs">${sidebar(doc, all.filter((h) => h.level === 2))}<article class="prose">${html}${pager}${source}</article></main>`
  };
}

// ---------- facts gathered at build time ----------

function countStats(): { tests: number; sourceLines: number; exports: number } {
  let tests = 0;
  let sourceLines = 0;
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name.endsWith('.ts') ? [join(dir, entry.name)] : []);
  for (const file of [...walk(join(REPO, 'src')), ...walk(join(REPO, 'examples')), ...walk(join(REPO, 'scripts'))]) {
    const text = read(file);
    if (file.endsWith('.test.ts')) tests += (text.match(/^\s*test\(/gm) ?? []).length;
    else if (file.startsWith(join(REPO, 'src'))) sourceLines += text.split('\n').length - 1;
  }
  return { tests, sourceLines, exports: exportsOf('index').length + exportsOf('http').length };
}

/** What `bun run example` prints right now, with long lines cut so the page does not scroll sideways. */
function tourOutput(): string {
  const run = Bun.spawnSync([process.execPath, join(REPO, 'examples', 'notes', 'main.ts'), 'tour'], { cwd: REPO, env: { ...process.env, NO_COLOR: '1' }, stdout: 'pipe', stderr: 'pipe' });
  if (run.exitCode !== 0) throw new Error(`the example tour failed, so the site cannot show its output:\n${run.stderr.toString().trim()}`);
  return run.stdout.toString().trim().split('\n').map((line) => (line.length > 88 ? `${line.slice(0, 87)}…` : line)).join('\n');
}

function gitCommit(): string {
  const run = Bun.spawnSync(['git', '-C', REPO, 'rev-parse', '--short', 'HEAD'], { stdout: 'pipe', stderr: 'pipe' });
  return run.exitCode === 0 ? run.stdout.toString().trim() : 'an unknown commit';
}

// ---------- build ----------

export function buildSite(out: string = DEFAULT_OUT): { out: string; pages: string[] } {
  const commit = process.env.SOURCE_SHA || gitCommit();
  const version = (JSON.parse(read(join(REPO, 'package.json'))) as { version: string }).version;
  rmSync(out, { recursive: true, force: true });
  const pages: Page[] = [];

  pages.push({
    path: 'index.html',
    title: `${PROJECT.name}: ${PROJECT.tagline}`,
    description: PROJECT.summary,
    section: 'home',
    body: landingBody({
      version,
      stats: countStats(),
      heroCode: read(join(REPO, 'site', 'content', 'hero.ts')).trim(),
      agentsSnippet: read(join(DOCS_DIR, 'snippets', 'AGENTS.md')).trim(),
      tourOutput: tourOutput()
    })
  });
  if (!pages[0]!.body.includes(AIRES_HTML.trim())) throw new Error('The landing page lost its Aires block (site/aires.ts).');

  for (const guide of GUIDES) {
    pages.push(docPage({ slug: guide.slug, title: guide.title, repoPath: `docs/${guide.slug}.md`, sitePath: `docs/${guide.slug}.html` }, read(guidePath(guide.slug))));
  }
  pages.push(docPage({ slug: 'index', title: 'Documentation', repoPath: 'docs/README.md', sitePath: 'docs/index.html' }, read(join(DOCS_DIR, 'README.md'))));
  pages.push(docPage({ slug: 'example-notes', title: 'The example app', repoPath: EXAMPLE_README, sitePath: 'docs/example-notes.html' }, read(join(REPO, EXAMPLE_README))));
  pages.push({
    path: '404.html',
    title: `Page not found · ${PROJECT.name}`,
    description: 'That page does not exist.',
    section: 'home',
    body: `<main><section><div class="wrap"><div class="section-head"><p class="kicker">404</p><h2>That page does not exist.</h2><p class="lede">It may have moved. The guides are all listed on the <a href="docs/index.html">documentation page</a>.</p></div></div></section></main>`
  });

  for (const page of pages) {
    const file = join(out, page.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, shell(page, commit));
  }

  // Plain files: the Markdown guides (for people and models that prefer them), llms.txt, the cheat sheet.
  const stripComments = (markdown: string) => markdown.replace(/<!--[\s\S]*?-->\n?/g, '');
  for (const file of readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md'))) {
    writeFileSync(join(out, 'docs', file), stripComments(read(join(DOCS_DIR, file))));
  }
  for (const folder of ['snippets', 'cheatsheet', 'images']) cpSync(join(DOCS_DIR, folder), join(out, 'docs', folder), { recursive: true });
  for (const file of ['llms.txt', 'llms-full.txt']) cpSync(join(REPO, file), join(out, file));
  // Tells GitHub Pages to serve the files as they are.
  writeFileSync(join(out, '.nojekyll'), '');
  return { out, pages: pages.map((p) => p.path) };
}

// ---------- serve ----------

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8'
};

function serve(out: string, port: number): void {
  const root = resolve(out);
  const server = Bun.serve({
    // This machine only: a preview is not something other computers on the network should reach.
    hostname: '127.0.0.1',
    port,
    fetch(request) {
      let path = decodeURIComponent(new URL(request.url).pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(join(root, path));
      // Never serve anything outside the built folder.
      if (file !== root && !file.startsWith(`${root}/`)) return new Response('Not found', { status: 404 });
      if (!existsSync(file)) return new Response(Bun.file(join(root, '404.html')), { status: 404, headers: { 'content-type': TYPES['.html']! } });
      const type = TYPES[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream';
      return new Response(Bun.file(file), { headers: { 'content-type': type, 'cache-control': 'no-store' } });
    }
  });
  console.log(`site: http://127.0.0.1:${server.port}/   (${relative(REPO, out)}; Ctrl-C to stop)`);
}

// ---------- publish ----------

/** One commit on gh-pages whose tree is exactly the built site, pushed without touching the working branch. */
function publish(remote: string): void {
  const out = DEFAULT_OUT;
  buildSite(out);
  const git = (args: string[], env?: Record<string, string | undefined>) => {
    const run = Bun.spawnSync(['git', '-C', REPO, ...args], { env: env ?? process.env, stdout: 'pipe', stderr: 'pipe' });
    return { ok: run.exitCode === 0, out: run.stdout.toString().trim(), err: run.stderr.toString().trim() };
  };
  const must = (args: string[], env?: Record<string, string | undefined>): string => {
    const result = git(args, env);
    if (!result.ok) {
      console.error(`publish failed: git ${args.join(' ')}\n${result.err}`);
      process.exit(1);
    }
    return result.out;
  };
  if (!git(['remote', 'get-url', remote]).ok) {
    console.error(`There is no git remote called "${remote}". Fix: git remote add ${remote} ${PROJECT.repoUrl}.git, or pass --remote <name>.`);
    process.exit(1);
  }
  const index = join(REPO, '.git', 'pages-index');
  rmSync(index, { force: true });
  // Site commits carry the project handle, not a personal name.
  const env = { ...process.env, GIT_INDEX_FILE: index, GIT_AUTHOR_NAME: 'garkpit', GIT_AUTHOR_EMAIL: 'garkpit@users.noreply.github.com', GIT_COMMITTER_NAME: 'garkpit', GIT_COMMITTER_EMAIL: 'garkpit@users.noreply.github.com' };
  must([`--work-tree=${out}`, 'add', '-A', '.'], env);
  const tree = must(['write-tree'], env);
  rmSync(index, { force: true });
  git(['fetch', '-q', remote, 'gh-pages']);
  const parent = git(['rev-parse', '--verify', '-q', `refs/remotes/${remote}/gh-pages`]).out;
  if (parent && git(['rev-parse', `${parent}^{tree}`]).out === tree) {
    console.log('gh-pages already holds this site; nothing to push.');
    return;
  }
  const commit = must(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `site: built from ${gitCommit()}`], env);
  must(['update-ref', 'refs/heads/gh-pages', commit]);
  const push = Bun.spawnSync(['git', '-C', REPO, 'push', remote, 'gh-pages'], { stdout: 'inherit', stderr: 'inherit' });
  if (push.exitCode !== 0) {
    console.error(`The push failed. The commit is on your local gh-pages branch; fix access and run: git push ${remote} gh-pages`);
    process.exit(1);
  }
  console.log(`pushed gh-pages ${commit.slice(0, 7)} to ${remote}. In the repository's Pages settings, serve the gh-pages branch from its root folder.`);
}

// ---------- command line ----------

function help(name?: string): string {
  const command = COMMANDS.find((c) => c.name === name);
  if (command) {
    const flags = command.flags.map(([flag, text]) => `  ${flag.padEnd(17)} ${text}`).join('\n');
    return `site ${command.usage}\n  ${command.what}\n${flags ? `\nFlags\n${flags}\n` : ''}\nExample\n  ${command.example}\n`;
  }
  return `site: the GarkpitMediator documentation site\n\nUsage\n  bun scripts/site.ts <command>\n\nCommands\n${COMMANDS.map((c) => `  ${c.name.padEnd(8)} ${c.what}`).join('\n')}\n\nRun "help <command>" for flags and an example.\nExit codes: 0 done, 1 failed, 2 usage error.\n`;
}

/** Reads `--name value` flags; anything else is a usage error that names the flags allowed. */
function flags(command: string, args: string[], allowed: Record<string, 'value' | 'switch'>): Record<string, string> {
  const found: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const kind = allowed[arg];
    if (kind === 'switch') found[arg] = 'true';
    else if (kind === 'value' && args[i + 1] !== undefined) found[arg] = args[++i]!;
    else {
      const near = Object.keys(allowed).find((flag) => flag.startsWith(arg.slice(0, 4)));
      console.error(`${kind === 'value' ? `${arg} needs a value` : `Unknown flag "${arg}" for ${command}`}.${near && kind !== 'value' ? ` Did you mean ${near}?` : ''} Run "bun scripts/site.ts help ${command}".`);
      process.exit(2);
    }
  }
  return found;
}

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2);
  try {
    if (!command || command === '--help' || command === '-h') process.stdout.write(help());
    else if (command === 'help') process.stdout.write(help(rest[0]));
    else if (rest.includes('--help') || rest.includes('-h')) process.stdout.write(help(command));
    else if (command === 'build') {
      const given = flags('build', rest, { '--out': 'value' });
      const result = buildSite(given['--out'] ? resolve(given['--out']) : DEFAULT_OUT);
      console.log(`site built: ${result.pages.length} pages in ${result.out}\n  open ${join(result.out, 'index.html')}\n  or: bun run site:serve`);
    } else if (command === 'serve') {
      const given = flags('serve', rest, { '--port': 'value', '--out': 'value' });
      const port = Number(given['--port'] ?? process.env.PORT ?? 4420);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        console.error('The port must be a whole number from 0 to 65535. Example: bun scripts/site.ts serve --port 4420');
        process.exit(2);
      }
      serve(buildSite(given['--out'] ? resolve(given['--out']) : DEFAULT_OUT).out, port);
    } else if (command === 'publish') {
      const given = flags('publish', rest, { '--confirm-public': 'switch', '--remote': 'value' });
      if (!given['--confirm-public']) {
        console.error('publish makes the site public. If that is what you mean, run: bun scripts/site.ts publish --confirm-public');
        process.exit(2);
      }
      publish(given['--remote'] ?? 'origin');
    } else {
      const hint = COMMANDS.map((c) => c.name).find((name) => name[0] === command[0]);
      console.error(`Unknown command "${command}".${hint ? ` Did you mean "${hint}"?` : ''} Run "bun scripts/site.ts help" for the list.`);
      process.exit(2);
    }
  } catch (error) {
    console.error(`site: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
