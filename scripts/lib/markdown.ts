// Reading the Markdown guides: their fenced code blocks (for the compile check), their headings and
// links (for the link check), and their HTML (for the site). Rendering uses Bun's built-in Markdown.
import { escapeHtml, highlight, LANGUAGE_NAMES } from './highlight';

export interface CodeBlock {
  /** First word of the info string: ts, sh, json… */
  language: string;
  /** The rest of the info string, e.g. "nocheck". */
  flags: string[];
  code: string;
  /** 1-based line of the opening fence. */
  line: number;
  /** Contents of a `<!-- check:prelude … -->` comment directly above the block. */
  prelude: string;
  /** Path named by a `<!-- snippet:path -->` comment directly above the block. */
  snippet: string | undefined;
}

export function codeBlocks(markdown: string): CodeBlock[] {
  const lines = markdown.split('\n');
  const blocks: CodeBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^```(\S*)\s*(.*)$/.exec(lines[i]!);
    if (!open) continue;
    const start = i;
    const body: string[] = [];
    for (i++; i < lines.length && !/^```\s*$/.test(lines[i]!); i++) body.push(lines[i]!);

    // Look upward for a comment that ends on the line before the fence.
    let prelude = '';
    let snippet: string | undefined;
    if (start > 0 && /-->\s*$/.test(lines[start - 1]!)) {
      let from = start - 1;
      while (from > 0 && !lines[from]!.includes('<!--')) from--;
      const comment = lines.slice(from, start).join('\n');
      const pre = /<!--\s*check:prelude\n([\s\S]*?)\n?-->/.exec(comment);
      if (pre) prelude = pre[1]!;
      const snip = /<!--\s*snippet:(\S+)\s*-->/.exec(comment);
      if (snip) snippet = snip[1];
    }
    blocks.push({ language: open[1] || 'text', flags: open[2]!.split(/\s+/).filter(Boolean), code: body.join('\n'), line: start + 1, prelude, snippet });
  }
  return blocks;
}

export interface Heading {
  level: number;
  id: string;
  text: string;
}

const unescapeHtml = (text: string): string =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** Markdown outside fenced code blocks, so text checks do not trip over sample code. */
export function proseOnly(markdown: string): string {
  return markdown.replace(/^```[\s\S]*?^```\s*$/gm, '');
}

function rawHtml(markdown: string): string {
  return Bun.markdown.html(markdown, { headings: { ids: true } });
}

export function headings(markdown: string): Heading[] {
  return [...rawHtml(markdown).matchAll(/<h([1-6]) id="([^"]*)">([\s\S]*?)<\/h\1>/g)].map((m) => ({
    level: Number(m[1]),
    id: m[2]!,
    text: unescapeHtml(m[3]!.replace(/<[^>]+>/g, ''))
  }));
}

/** Every Markdown link and image target in the prose: `[text](target)`. */
export function linkTargets(markdown: string): string[] {
  return [...rawHtml(markdown).matchAll(/<(?:a href|img src)="([^"]+)"/g)].map((m) => unescapeHtml(m[1]!));
}

export interface RenderOptions {
  /** Rewrites a link or image target (relative to the Markdown file) for the built site. */
  rewriteLink(target: string): string;
  /** Replaces an image with inline HTML (the site inlines its diagrams); return undefined to keep the image. */
  inlineImage?(src: string, alt: string): string | undefined;
}

/** A code block with its language label and copy button. Long lines scroll inside it (data-bleed marks that as intended). */
export function codeBlockHtml(code: string, language: string): string {
  const label = LANGUAGE_NAMES[language] ?? language;
  return `<div class="code" data-lang="${escapeHtml(language)}" data-bleed><div class="code-bar"><span class="code-lang">${escapeHtml(label)}</span><button class="copy" type="button" data-copy aria-label="Copy this code">Copy</button></div><pre><code>${highlight(code, language)}</code></pre></div>`;
}

/** A guide as site HTML: comments dropped, code highlighted with a copy button, links rewritten, tables wrapped. */
export function renderMarkdown(markdown: string, options: RenderOptions): string {
  let html = rawHtml(markdown);
  html = html.replace(/<!--[\s\S]*?-->\n?/g, '');
  html = html.replace(/<pre><code(?: class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g, (_all, language: string | undefined, body: string) =>
    codeBlockHtml(unescapeHtml(body).replace(/\n$/, ''), language ?? 'text'));
  html = html.replace(/<p><img src="([^"]+)" alt="([^"]*)"(?: \/)?><\/p>/g, (all, src: string, alt: string) => {
    const inline = options.inlineImage?.(unescapeHtml(src), unescapeHtml(alt));
    return inline !== undefined ? `<figure class="doc-figure">${inline}<figcaption>${alt}</figcaption></figure>` : all;
  });
  html = html.replace(/<(a href|img src)="([^"]+)"/g, (_all, attr: string, target: string) => `<${attr}="${escapeHtml(options.rewriteLink(unescapeHtml(target)))}"`);
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  html = html.replace(/<h([23]) id="([^"]*)">([\s\S]*?)<\/h\1>/g, (_all, level: string, id: string, inner: string) =>
    `<h${level} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`);
  return html;
}
