// Renders the cheat sheet data as Markdown and as one self-contained HTML page.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeHtml, highlight } from '../lib/highlight';
import { FAVICON, REPO } from '../lib/manifest';
import { sheet, type Section } from './data';

const version = (): string => (JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { version: string }).version;

export function renderMarkdown(): string {
  const out: string[] = [`# ${sheet.title}`, '', `\`@garkpit/mediator\` ${version()}. ${sheet.lede}`, ''];
  for (const section of sheet.sections as Section[]) {
    out.push(`## ${section.title}`, '');
    if (section.intro) out.push(section.intro, '');
    if (section.code) out.push(`\`\`\`${section.code.language}`, section.code.source, '```', '');
    if (section.rows) {
      out.push('| | |', '|---|---|', ...section.rows.map((row) => `| \`${row.name}\` | ${row.text.replace(/\|/g, '\\|')} |`), '');
    }
    if (section.points) out.push(...section.points.map((point) => `- ${point}`), '');
  }
  out.push('## Read more', '', ...sheet.guides.map(([title, slug]) => `- [${title}](../${slug}.md)`), '', `Source: ${sheet.repoUrl}`, '');
  return out.join('\n');
}

/** Inline `code` and **bold** in a short line of text. */
function inline(text: string): string {
  return escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function sectionHtml(section: Section): string {
  const parts = [`<h2>${escapeHtml(section.title)}</h2>`];
  if (section.intro) parts.push(`<p class="intro">${inline(section.intro)}</p>`);
  if (section.code) parts.push(`<pre><code>${highlight(section.code.source, section.code.language)}</code></pre>`);
  if (section.rows) parts.push(`<dl>${section.rows.map((row) => `<dt><code>${escapeHtml(row.name)}</code></dt><dd>${inline(row.text)}</dd>`).join('')}</dl>`);
  if (section.points) parts.push(`<ul>${section.points.map((point) => `<li>${inline(point)}</li>`).join('')}</ul>`);
  return `<article class="card">${parts.join('')}</article>`;
}

const kit = (file: string): string => readFileSync(join(REPO, 'site', 'kit', file), 'utf8');

const SHEET_CSS = `
body { padding: var(--space-4) clamp(1rem, 3vw, 3rem) var(--space-5); }
.sheet-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-4); }
.sheet-head h1 { font-size: var(--step-3); }
.sheet-head p { color: var(--muted); max-width: 80ch; margin-top: var(--space-1); }
.sheet-head nav { display: flex; gap: var(--space-2); align-items: center; }
.lead { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: var(--space-3); align-items: stretch; }
.cards { columns: 3 26rem; column-gap: var(--space-3); }
@media screen and (max-width: 900px) { .lead { grid-template-columns: minmax(0, 1fr); } }
.card { break-inside: avoid; background: var(--surface-alt); border-radius: var(--radius-2); box-shadow: var(--shadow-1); padding: var(--space-3); margin-bottom: var(--space-3); }
.card h2 { font-size: var(--step-1); line-height: 1.2; max-width: none; margin-bottom: var(--space-2); color: var(--accent-text); }
.card p, .card li, .card dd { font-size: var(--step--1); line-height: 1.5; max-width: none; }
.card .intro { color: var(--muted); margin-bottom: var(--space-2); }
.card pre { background: var(--surface); border-radius: var(--radius-1); padding: var(--space-2); overflow-x: auto; font-size: 0.78rem; line-height: 1.55; margin-bottom: var(--space-2); }
.card pre code { background: none; padding: 0; font-size: inherit; }
.card dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0.45rem var(--space-2); }
.card dt code { white-space: nowrap; font-weight: 600; }
.card dd { margin: 0; }
.card ul { list-style: none; display: grid; gap: 0.45rem; }
.card li { padding-left: 1em; position: relative; }
.card li::before { content: ""; position: absolute; left: 0; top: 0.62em; width: 0.4em; height: 0.4em; border-radius: 50%; background: var(--accent); }
.card ul:not(:first-child), .card dl + ul { margin-top: var(--space-2); }
.more { color: var(--muted); font-size: var(--step--1); margin-top: var(--space-3); }
.tk-c { color: var(--muted); font-style: italic; }
.tk-s { color: var(--positive); }
.tk-k { color: var(--accent-text); }
.tk-n { color: color-mix(in oklab, var(--accent) 55%, var(--text)); }
.tk-t { color: color-mix(in oklab, var(--accent-2) 70%, var(--text)); }
.tk-f { font-weight: 600; }
.tk-p { color: color-mix(in oklab, var(--text) 74%, var(--surface-alt)); }
@page { size: A4 landscape; margin: 7mm; }
@media print {
  html { font-size: 7.5pt; }
  body { padding: 0; }
  .lead { gap: 4mm; }
  /* Rows of three for paper: a multi-column block will not start part-way down a printed page. */
  .cards { columns: auto; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4mm; align-items: start; }
  .card { box-shadow: none; border: 0.3mm solid var(--line); padding: 3mm; margin-bottom: 0; }
  .card pre { font-size: 6.2pt; white-space: pre-wrap; }
  .lead .card { margin-bottom: 4mm; }
  .sheet-head { margin-bottom: 3mm; }
  .sheet-head h1 { font-size: 15pt; }
}
`;

export function renderHtml(): string {
  const sections = sheet.sections as Section[];
  const lead = sections.slice(0, 2).map(sectionHtml).join('\n');
  const cards = sections.slice(2).map(sectionHtml).join('\n');
  const more = sheet.guides.map(([title, slug]) => `<a href="../${slug}.md">${escapeHtml(title)}</a>`).join(' · ');
  return `<!doctype html>
<html lang="en-GB" data-direction="clay" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(sheet.title)}</title>
<meta name="description" content="${escapeHtml(sheet.lede)}">
<link rel="icon" href="${FAVICON}">
<script data-page-kit="head">${kit('head.js').trim()}</script>
<style data-page-kit="tokens">${kit('tokens.css')}</style>
<style data-page-kit="base">${kit('base.css')}</style>
<style data-page-kit="direction">${kit('clay.css')}</style>
<style>${SHEET_CSS}</style>
</head>
<body>
<header class="sheet-head">
<div><h1>${escapeHtml(sheet.title)}</h1><p><code>@garkpit/mediator</code> ${escapeHtml(version())}. ${escapeHtml(sheet.lede)}</p></div>
<nav class="no-print"><button type="button" data-theme-toggle></button></nav>
</header>
<div class="lead">
${lead}
</div>
<div class="cards">
${cards}
</div>
<p class="more">Read more: ${more} · <a href="${sheet.repoUrl}">${sheet.repoUrl.replace('https://', '')}</a></p>
<script type="application/json" id="page-kit-config" data-page-kit="config">{"direction":"clay","accent":"default","motion":[]}</script>
<script data-page-kit="runtime">${kit('page-kit.js').replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>
`;
}
