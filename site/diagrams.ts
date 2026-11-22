// The two diagrams, drawn in code so they stay sharp, small and in step with the docs.
// Each comes in two forms from the same drawing: `tokens` for the site, coloured by the page's own
// theme, and `standalone` for docs/images/*.svg, which carries its own light and dark palette so it
// reads correctly wherever Markdown is rendered.

export type DiagramMode = 'tokens' | 'standalone';

const LIGHT = { surface: '#f3ece2', alt: '#fcf8f3', text: '#2a1f19', muted: '#69584b', line: '#e0d3c2', accent: '#b5502b', onAccent: '#fff8f2', ring1: '#f6ebe3', ring2: '#f1dfd5', ring3: '#ebd0c3' };
const DARK = { surface: '#1e1814', alt: '#2a221d', text: '#f2e8dc', muted: '#bba996', line: '#40352c', accent: '#e3895f', onAccent: '#24140b', ring1: '#392a22', ring2: '#463226', ring3: '#563b2d' };

function variables(p: typeof LIGHT): string {
  return `--dg-surface:${p.surface};--dg-alt:${p.alt};--dg-text:${p.text};--dg-muted:${p.muted};--dg-line:${p.line};--dg-accent:${p.accent};--dg-on-accent:${p.onAccent};--dg-ring1:${p.ring1};--dg-ring2:${p.ring2};--dg-ring3:${p.ring3};`;
}

function style(mode: DiagramMode): string {
  const vars =
    mode === 'tokens'
      ? `.dg{--dg-surface:var(--pk-surface);--dg-alt:var(--pk-surface-alt);--dg-text:var(--text);--dg-muted:var(--muted);--dg-line:var(--line);--dg-accent:var(--accent);--dg-on-accent:var(--on-accent);--dg-ring1:color-mix(in oklab,var(--accent) 8%,var(--pk-surface-alt));--dg-ring2:color-mix(in oklab,var(--accent) 16%,var(--pk-surface-alt));--dg-ring3:color-mix(in oklab,var(--accent) 26%,var(--pk-surface-alt));--dg-sans:var(--font-label);--dg-mono:var(--font-mono);}`
      : `.dg{${variables(LIGHT)}--dg-sans:"Avenir Next",Avenir,system-ui,-apple-system,"Segoe UI",sans-serif;--dg-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;}@media (prefers-color-scheme:dark){.dg{${variables(DARK)}}}`;
  return `<style>${vars}
.dg text{font-family:var(--dg-sans);fill:var(--dg-text);}
.dg .bg{fill:var(--dg-surface);}
.dg .ring1{fill:var(--dg-ring1);stroke:var(--dg-line);stroke-width:2;}
.dg .ring2{fill:var(--dg-ring2);stroke:var(--dg-line);stroke-width:2;}
.dg .ring3{fill:var(--dg-ring3);stroke:var(--dg-line);stroke-width:2;}
.dg .box{fill:var(--dg-alt);stroke:var(--dg-line);stroke-width:2;}
.dg .hot{fill:var(--dg-accent);}
.dg .arrow{fill:none;stroke:var(--dg-text);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;}
.dg .dash{fill:none;stroke:var(--dg-muted);stroke-width:2;stroke-linecap:round;stroke-dasharray:2 8;}
.dg .dot{fill:var(--dg-alt);stroke:var(--dg-accent);stroke-width:2.5;}
.dg .title{font-size:20px;font-weight:600;letter-spacing:-0.01em;}
.dg .name{font-size:18px;font-weight:600;}
.dg .small{font-size:14.5px;fill:var(--dg-muted);}
.dg .num{font-size:14px;font-weight:600;text-anchor:middle;}
.dg .mono{font-family:var(--dg-mono);font-size:14px;}
.dg .on-hot{fill:var(--dg-on-accent);}
.dg .mid{text-anchor:middle;}
.dg .end{text-anchor:end;}
</style>`;
}

function frame(mode: DiagramMode, width: number, height: number, title: string, description: string, body: string): string {
  const background = mode === 'standalone' ? `<rect class="bg" width="${width}" height="${height}" rx="30"/>` : '';
  const xmlns = mode === 'standalone' ? ' xmlns="http://www.w3.org/2000/svg"' : '';
  return `<svg${xmlns} class="dg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${title.replace(/\W+/g, '-').toLowerCase()}-title"><title id="${title.replace(/\W+/g, '-').toLowerCase()}-title">${title}</title><desc>${description}</desc>${style(mode)}${background}${body}</svg>\n`;
}

const head = (x: number, y: number) => `<path class="arrow" d="M${x - 13} ${y - 8} L${x} ${y} L${x - 13} ${y + 8}"/>`;
const dot = (x: number, y: number, n: number) => `<circle class="dot" cx="${x}" cy="${y}" r="13"/><text class="num" x="${x}" y="${y + 5}">${n}</text>`;
const lines = (x: number, y: number, cls: string, ...text: string[]) => text.map((t, i) => `<text class="${cls}" x="${x}" y="${y + i * 19}">${t}</text>`).join('');

/** send → behaviors, outermost first → handler → back out through the same behaviors. */
export function pipelineSvg(mode: DiagramMode): string {
  const y = 300;
  const body = [
    // The three behaviors, drawn as rings around the handler.
    `<rect class="ring1" x="235" y="60" width="930" height="400" rx="30"/>`,
    `<text class="title" x="265" y="99">MutexBehavior</text><text class="small end" x="1135" y="99">outermost: first in, last out</text>`,
    `<rect class="ring2" x="350" y="125" width="700" height="300" rx="24"/>`,
    `<text class="title" x="378" y="163">AuditBehavior</text>`,
    `<rect class="ring3" x="465" y="190" width="470" height="200" rx="18"/>`,
    `<text class="title" x="491" y="226">LoggingBehavior</text>`,
    // The handler at the centre.
    `<rect class="hot" x="580" y="250" width="240" height="100" rx="14"/>`,
    `<text class="title mid on-hot" x="700" y="296">Handler</text><text class="mid on-hot" x="700" y="321" style="font-size:14.5px">does the work, once</text>`,
    // The caller, before and after.
    `<rect class="box" x="20" y="240" width="170" height="120" rx="18"/>`,
    `<text class="name mid" x="105" y="281">Your code</text>${lines(105, 308, 'mono mid', 'mediator.send(', 'request, ctx)')}`,
    `<rect class="box" x="1210" y="240" width="170" height="120" rx="18"/>`,
    `<text class="name mid" x="1295" y="281">Back to you</text>${lines(1295, 308, 'small mid', 'the result,', 'or the error')}`,
    // In, and back out.
    `<path class="arrow" d="M196 ${y} H572"/>${head(574, y)}`,
    `<path class="arrow" d="M826 ${y} H1202"/>${head(1204, y)}`,
    dot(235, y, 1), dot(350, y, 2), dot(465, y, 3), dot(935, y, 4), dot(1050, y, 5), dot(1165, y, 6),
    // What each behavior does on the way in and on the way out.
    lines(292, 338, 'small mid', 'take the', 'lock'),
    lines(407, 338, 'small mid', 'start the', 'clock'),
    lines(522, 338, 'small mid', 'start the', 'clock'),
    lines(878, 338, 'small mid', 'log one', 'line'),
    lines(993, 338, 'small mid', 'write the', 'audit row'),
    lines(1108, 338, 'small mid', 'release', 'the lock')
  ].join('');
  return frame(mode, 1400, 500, 'The request pipeline',
    'A request sent with mediator.send passes through MutexBehavior, then AuditBehavior, then LoggingBehavior, reaches its one handler, and the result travels back out through LoggingBehavior, AuditBehavior and MutexBehavior to the caller.',
    body);
}

/** Web pages, a chat assistant and MCP clients all send the same requests through one pipeline. */
export function doorsSvg(mode: DiagramMode): string {
  const door = (yTop: number, name: string, ...sub: string[]) =>
    `<rect class="box" x="60" y="${yTop}" width="280" height="110" rx="18"/><text class="name" x="86" y="${yTop + 40}">${name}</text>${lines(86, yTop + 66, 'small', ...sub)}`;
  const step = (yTop: number, label: string) =>
    `<rect class="box" x="795" y="${yTop}" width="190" height="40" rx="20"/><text class="mid" x="890" y="${yTop + 26}" style="font-size:15.5px">${label}</text>`;
  const handler = (yTop: number, name: string, kind: string) =>
    `<rect class="ring1" x="1099" y="${yTop}" width="263" height="50" rx="12"/><text class="mono" x="1115" y="${yTop + 31}" style="font-size:15px">${name}</text><text class="small end" x="1346" y="${yTop + 31}">${kind}</text>`;
  const body = [
    door(30, 'Web pages', 'a person presses a button'),
    door(175, 'Chat assistant', 'reads run at once; changes', 'wait for a person to confirm'),
    door(320, 'MCP', 'outside agents: Claude, Codex,', 'or one you wrote'),
    // All three reach the same call.
    `<path class="arrow" d="M346 85 C 390 85, 372 222, 405 229"/>`,
    `<path class="arrow" d="M346 230 H405"/>${head(409, 230)}`,
    `<path class="arrow" d="M346 375 C 390 375, 372 238, 405 231"/>`,
    `<rect class="hot" x="415" y="195" width="290" height="70" rx="35"/>`,
    `<text class="mono mid on-hot" x="560" y="235" style="font-size:15px;font-weight:600">mediator.send(request, ctx)</text>`,
    `<path class="arrow" d="M711 230 H765"/>${head(769, 230)}`,
    // The pipeline.
    `<rect class="ring2" x="775" y="80" width="230" height="300" rx="24"/>`,
    `<text class="title mid" x="890" y="121">One pipeline</text>`,
    step(145, 'lock'), step(197, 'audit'), step(249, 'log'), step(301, 'your own rules'),
    `<path class="arrow" d="M1011 230 H1071"/>${head(1075, 230)}`,
    // The handlers.
    `<rect class="box" x="1081" y="50" width="299" height="360" rx="24"/>`,
    `<text class="title mid" x="1230" y="91">One handler each</text>`,
    handler(112, 'CreateNote', 'command'), handler(172, 'RenameNote', 'command'), handler(232, 'GetNote', 'query'), handler(292, 'ListNotes', 'query'),
    `<text class="small mid" x="1230" y="381">and every feature you add</text>`,
    // The same list, described once, is what the assistant and MCP are offered as tools.
    `<path class="dash" d="M1230 410 V452 Q1230 468 1214 468 H946"/>`,
    `<rect class="box" x="520" y="440" width="420" height="56" rx="28" style="stroke-dasharray:2 8;stroke-linecap:round"/>`,
    `<text class="mid" x="730" y="473" style="font-size:15.5px">Tool catalogue: one entry per Command and Query</text>`,
    `<path class="dash" d="M514 468 H46 Q30 468 30 452 V246 Q30 230 46 230 H56"/><path class="dash" d="M30 375 H56"/>`
  ].join('');
  return frame(mode, 1400, 520, 'Three doors, one pipeline',
    'Web pages, a chat assistant and outside agents over MCP each call mediator.send. Every request passes through one pipeline (lock, audit, log, your own rules) to its one handler. A tool catalogue with one entry per Command and Query is what the chat assistant and MCP offer as tools.',
    body);
}
