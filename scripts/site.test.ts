import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { GUIDES, REPO } from './lib/manifest';
import { buildSite } from './site';

const out = mkdtempSync(join(tmpdir(), 'mediator-site-'));
const built = buildSite(out);
afterAll(() => rmSync(out, { recursive: true, force: true }));

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);

describe('the documentation site', () => {
  test('has a landing page, a page and a Markdown copy for every guide, llms.txt and the cheat sheet', () => {
    const expected = [
      'index.html', '404.html', 'llms.txt', 'llms-full.txt', '.nojekyll', 'docs/index.html', 'docs/example-notes.html',
      'docs/snippets/AGENTS.md', 'docs/cheatsheet/GarkpitMediator-CheatSheet.html', 'docs/cheatsheet/GarkpitMediator-CheatSheet.pdf',
      ...GUIDES.flatMap((g) => [`docs/${g.slug}.html`, `docs/${g.slug}.md`])
    ];
    expect(expected.filter((file) => !existsSync(join(out, file)))).toEqual([]);
    expect(built.pages.length).toBe(GUIDES.length + 4);
  });

  test('every internal link and #anchor on every page points at something that exists', () => {
    const broken: string[] = [];
    for (const file of walk(out).filter((f) => f.endsWith('.html'))) {
      const html = readFileSync(file, 'utf8');
      for (const match of html.matchAll(/<(?:a|img|link)\b[^>]*?\b(?:href|src)="([^"]+)"/g)) {
        const target = match[1]!.replace(/&amp;/g, '&');
        if (/^(https?:|mailto:|data:)/.test(target)) continue;
        const [path, anchor] = target.split('#') as [string, string | undefined];
        const resolved = path === '' ? file : resolve(dirname(file), path);
        if (!existsSync(resolved)) broken.push(`${relative(out, file)} -> ${target}`);
        else if (anchor && resolved.endsWith('.html') && !readFileSync(resolved, 'utf8').includes(`id="${anchor}"`)) broken.push(`${relative(out, file)} -> ${target} (no such anchor)`);
      }
    }
    expect(broken).toEqual([]);
  });

  test('pages load nothing from other sites: no external scripts, styles, fonts or images', () => {
    const offenders: string[] = [];
    for (const file of walk(out).filter((f) => f.endsWith('.html'))) {
      const html = readFileSync(file, 'utf8');
      for (const match of html.matchAll(/<(?:script|link|img|iframe|source)\b[^>]*?\b(?:src|href)="(https?:[^"]+)"/g)) offenders.push(`${relative(out, file)}: ${match[1]}`);
      if (/@import|url\(\s*["']?https?:/.test(html)) offenders.push(`${relative(out, file)}: a stylesheet reaches the network`);
    }
    expect(offenders).toEqual([]);
  });

  test('every page opens dark, carries a theme toggle, and every code block has a copy button', () => {
    for (const file of walk(out).filter((f) => f.endsWith('.html') && !f.includes('cheatsheet'))) {
      const html = readFileSync(file, 'utf8');
      expect(html).toContain('<html lang="en-GB" data-direction="clay" data-theme="dark">');
      expect(html).toContain('data-theme-toggle');
      expect((html.match(/<div class="code"/g) ?? []).length).toBe((html.match(/data-copy /g) ?? []).length);
    }
  });

  test('the wording about Aires lives in two source files only, so it can be changed in one edit each', () => {
    const tracked = Bun.spawnSync(['git', '-C', REPO, 'ls-files', '--cached', '--others', '--exclude-standard'], { stdout: 'pipe' }).stdout.toString().trim().split('\n');
    const generated = ['llms-full.txt', 'llms.txt'];
    const mentions = tracked
      .filter((file) => /\.(md|ts|js|css|html|txt|json)$/.test(file) && !file.startsWith('src/') && !generated.includes(file) && file !== 'scripts/site.test.ts')
      .filter((file) => existsSync(join(REPO, file)) && /\bAires\b/.test(readFileSync(join(REPO, file), 'utf8')))
      .sort();
    // AGENTS.md and scripts/site.ts only say where the wording lives; the wording itself is in the other two.
    expect(mentions).toEqual(['AGENTS.md', 'docs/agentic-interface.md', 'scripts/site.ts', 'site/aires.ts']);
    const guide = readFileSync(join(REPO, 'docs', 'agentic-interface.md'), 'utf8');
    const outside = guide.replace(/<!-- AIRES:START[\s\S]*?<!-- AIRES:END -->/, '');
    expect(/\bAires\b/.test(outside)).toBe(false);
  });
});
