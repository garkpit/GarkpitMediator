// Syntax highlighting at build time, with no dependency beyond the TypeScript compiler the repo
// already uses: its scanner gives exact tokens for TypeScript, and small hand-written passes cover
// shell, JSON and Markdown. Output is HTML spans with classes; the colours come from the site CSS.
import ts from 'typescript';

export const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const span = (kind: string, text: string): string => (text === '' ? '' : `<span class="tk-${kind}">${escapeHtml(text)}</span>`);

const LITERAL_KEYWORDS = new Set([
  ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword, ts.SyntaxKind.UndefinedKeyword
]);
/** After one of these a slash starts a division, not a regular expression. */
const VALUE_END = new Set([
  ts.SyntaxKind.Identifier, ts.SyntaxKind.NumericLiteral, ts.SyntaxKind.StringLiteral, ts.SyntaxKind.CloseParenToken,
  ts.SyntaxKind.CloseBracketToken, ts.SyntaxKind.CloseBraceToken, ts.SyntaxKind.ThisKeyword
]);

function highlightTypeScript(code: string): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, code);
  const out: string[] = [];
  /** One counter per open template literal: how many plain braces are open inside its `${ }`. */
  const templates: number[] = [];
  let previous: ts.SyntaxKind = ts.SyntaxKind.Unknown;

  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind === ts.SyntaxKind.CloseBraceToken && templates.length > 0 && templates[templates.length - 1] === 0) {
      kind = scanner.reScanTemplateToken(false);
      if (kind === ts.SyntaxKind.TemplateTail) templates.pop();
    } else if (kind === ts.SyntaxKind.OpenBraceToken && templates.length > 0) {
      templates[templates.length - 1]!++;
    } else if (kind === ts.SyntaxKind.CloseBraceToken && templates.length > 0) {
      templates[templates.length - 1]!--;
    } else if (kind === ts.SyntaxKind.TemplateHead) {
      templates.push(0);
    } else if ((kind === ts.SyntaxKind.SlashToken || kind === ts.SyntaxKind.SlashEqualsToken) && !VALUE_END.has(previous)) {
      kind = scanner.reScanSlashToken();
    }
    const text = scanner.getTokenText();

    if (kind === ts.SyntaxKind.WhitespaceTrivia || kind === ts.SyntaxKind.NewLineTrivia) {
      out.push(escapeHtml(text));
      continue;
    }
    if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) {
      out.push(span('c', text));
      continue;
    }

    if (
      kind === ts.SyntaxKind.StringLiteral || kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
      kind === ts.SyntaxKind.TemplateHead || kind === ts.SyntaxKind.TemplateMiddle || kind === ts.SyntaxKind.TemplateTail ||
      kind === ts.SyntaxKind.RegularExpressionLiteral
    ) {
      out.push(span('s', text));
    } else if (kind === ts.SyntaxKind.NumericLiteral || kind === ts.SyntaxKind.BigIntLiteral || LITERAL_KEYWORDS.has(kind)) {
      out.push(span('n', text));
    } else if (kind >= ts.SyntaxKind.FirstKeyword && kind <= ts.SyntaxKind.LastKeyword) {
      out.push(span('k', text));
    } else if (kind === ts.SyntaxKind.Identifier) {
      const next = code.slice(scanner.getTokenEnd()).match(/^\s*(.)/)?.[1];
      if (/^[A-Z]/.test(text) && !/^[A-Z0-9_]+$/.test(text)) out.push(span('t', text));
      else if (next === '(') out.push(span('f', text));
      else out.push(escapeHtml(text));
    } else {
      out.push(span('p', text));
    }
    previous = kind;
  }
  return out.join('');
}

function highlightShell(code: string): string {
  return code
    .split('\n')
    .map((line) => {
      const comment = /(^|\s)#.*$/.exec(line);
      const body = comment ? line.slice(0, comment.index + comment[1]!.length) : line;
      const tail = comment ? span('c', line.slice(comment.index + comment[1]!.length)) : '';
      let first = true;
      const painted = body.replace(/("[^"]*"|'[^']*')|(\s--?[A-Za-z][\w-]*)|([|&;]+|\\$)|([^\s"'|&;\\]+)/g, (match, str, flag, op, word) => {
        if (str !== undefined) return span('s', str);
        if (flag !== undefined) return span('n', flag);
        if (op !== undefined) {
          if (op !== '\\') first = true;
          return span('p', op);
        }
        if (first && word !== undefined) {
          first = false;
          return span('f', word);
        }
        return escapeHtml(match);
      });
      return painted + tail;
    })
    .join('\n');
}

function highlightJson(code: string): string {
  return code.replace(/("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?)|\b(true|false|null)\b|([{}\[\],:])|([^"\d{}\[\],:\s]+|\s+)/g,
    (match, str, colon, num, literal, punct) => {
      if (str !== undefined) return colon !== undefined ? `${span('t', str)}${span('p', colon)}` : span('s', str);
      if (num !== undefined) return span('n', num);
      if (literal !== undefined) return span('n', literal);
      if (punct !== undefined) return span('p', punct);
      return escapeHtml(match);
    });
}

function highlightMarkdown(code: string): string {
  return code
    .split('\n')
    .map((line) => {
      if (/^#{1,6}\s/.test(line)) return span('k', line);
      return escapeHtml(line).replace(/`[^`]+`/g, (m) => `<span class="tk-s">${m}</span>`);
    })
    .join('\n');
}

function highlightTree(code: string): string {
  return code
    .split('\n')
    .map((line) => {
      const m = /^(\s*)(\S+)(\s{2,})(.*)$/.exec(line);
      const name = (text: string) => (text.endsWith('/') ? span('t', text) : escapeHtml(text));
      if (m) return `${m[1]}${name(m[2]!)}${m[3]}${span('c', m[4]!)}`;
      const bare = /^(\s*)(\S+)\s*$/.exec(line);
      return bare ? `${bare[1]}${name(bare[2]!)}` : escapeHtml(line);
    })
    .join('\n');
}

export const LANGUAGE_NAMES: Record<string, string> = {
  ts: 'TypeScript', js: 'JavaScript', sh: 'Terminal', json: 'JSON', md: 'Markdown', text: 'Output', tree: 'Files'
};

/** Highlighted HTML for a code block. Unknown languages are escaped and left plain. */
export function highlight(code: string, language: string): string {
  switch (language) {
    case 'ts':
    case 'js':
      return highlightTypeScript(code);
    case 'sh':
      return highlightShell(code);
    case 'json':
      return highlightJson(code);
    case 'md':
      return highlightMarkdown(code);
    case 'tree':
      return highlightTree(code);
    default:
      return escapeHtml(code);
  }
}
