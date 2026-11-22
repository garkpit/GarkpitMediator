// The landing page's content. Layout and colour come from the kit (site/kit) and site/site.css.
import { escapeHtml, highlight } from '../scripts/lib/highlight';
import { GUIDES, PROJECT } from '../scripts/lib/manifest';
import { codeBlockHtml } from '../scripts/lib/markdown';
import { AIRES_HTML } from './aires';
import { doorsSvg, pipelineSvg } from './diagrams';

export interface LandingInput {
  version: string;
  /** Counted from the repository at build time. */
  stats: { tests: number; sourceLines: number; exports: number };
  heroCode: string;
  agentsSnippet: string;
  /** Real output of `bun run example`, captured at build time. */
  tourOutput: string;
}

const TYPICAL_TREE = `src/
  routes/
    notes.ts              every notes endpoint, 600 lines
    billing.ts
  services/
    noteService.ts        or does archiving go here?
    auditService.ts       remember to call this
  models/
    note.ts
  utils/
    locks.ts              and this
    helpers.ts`;

const SLICE_TREE = `src/features/notes/
  create-note/
  rename-note/
    RenameNote.ts             the request: inputs, lock key, audit record
    RenameNoteHandler.ts      the only code that renames a note
    RenameNote.test.ts        sends it through the real pipeline
  archive-note/               new: copy rename-note/, rename, write the handler
  get-note/
  list-notes/
  index.ts                    one registration line per folder`;

const COUNT_WORDS: Record<number, string> = { 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Eleven', 12: 'Twelve' };

function tree(source: string, markLine?: string): string {
  const html = highlight(source, 'tree');
  if (!markLine) return `<pre class="tree">${html}</pre>`;
  return `<pre class="tree">${html.split('\n').map((line) => (line.includes(markLine) ? `<mark>${line}</mark>` : line)).join('\n')}</pre>`;
}

export function landingBody(input: LandingInput): string {
  const { stats } = input;
  const guides = GUIDES.map((g) => `<li><a href="docs/${g.slug}.html">${escapeHtml(g.title)}</a><p>${escapeHtml(g.summary)}</p></li>`).join('\n');

  return `
<header class="masthead"><div class="wrap">
  <p class="kicker">${escapeHtml(PROJECT.packageName)} ${escapeHtml(input.version)} · MIT · zero dependencies</p>
  <h1 class="display">One front door for every feature.</h1>
  <p class="lede">A small TypeScript library that turns your app into a list of named Commands and Queries, each with exactly one handler. People can find their way around it. So can AI coding agents, and that is the difference between an app that doubles in size gracefully and one that ties itself in knots.</p>
  <div class="actions">
    <a class="button" href="docs/getting-started.html">Read the 60-second start</a>
    <a class="button" data-variant="quiet" href="#agents">Copy the AGENTS.md snippet</a>
  </div>
  <p class="byline">Source-only TypeScript · runs on Bun · no npm package, you copy it in</p>
</div></header>

<main>

<section id="shape"><div class="wrap">
  <div class="split shape">
    <div class="stack">
      <p class="kicker">What it looks like</p>
      <h2>A feature is a class, a handler and one line.</h2>
      <p>Each thing your app can do gets a name: a <strong>Command</strong> if it changes something, a <strong>Query</strong> if it only reads. You send one to the mediator and it runs the single handler registered for it, wrapped in the rules you have installed for every request.</p>
      <p>The caller never knows the handler. Move it, rewrite it, split it: nothing else changes.</p>
    </div>
    <div>${codeBlockHtml(input.heroCode, 'ts')}</div>
  </div>
  <div class="stats stats-row" data-motion="cascade">
    <div class="stat"><span class="stat-value">0</span><span class="stat-label">runtime dependencies. Nothing to audit, nothing to update.</span></div>
    <div class="stat"><span class="stat-value">1</span><span class="stat-label">handler per request, always. No guessing which code runs.</span></div>
    <div class="stat"><span class="stat-value">${stats.sourceLines}</span><span class="stat-label">lines of library source. You can read all of it in one sitting.</span></div>
    <div class="stat"><span class="stat-value">${stats.tests}</span><span class="stat-label">tests run on every check: the library's, the example app's and the docs site's.</span></div>
  </div>
</div></section>

<section id="why" data-ground="alt"><div class="wrap">
  <div class="section-head">
    <p class="kicker">Why it helps as you grow</p>
    <h2>Agents do well where there is one obvious place for each thing.</h2>
    <p class="lede">An AI coding agent starts every task knowing nothing about your project. It reads a few files, forms a picture and writes code to fit. Ask it to "let users archive a note" and see where that picture leads.</p>
  </div>
  <div class="compare" data-motion="rise">
    <div class="tray" data-quiet>
      <h3>A typical app, a year in</h3>
      ${tree(TYPICAL_TREE)}
      <p>Four reasonable places to put it, three existing styles to copy, and two things to remember to call. Each guess is a chance to drift.</p>
    </div>
    <div class="tray">
      <h3>The same app with a mediator</h3>
      ${tree(SLICE_TREE, 'archive-note/')}
      <p>One answer, the same one every time: a new folder beside its neighbours. Locking, auditing and logging come from the pipeline, so there is nothing to remember.</p>
    </div>
  </div>
  <dl class="facts reasons">
    <dt>The app can be listed</dt><dd>The feature folders, and <code>mediator.registeredRequestTypes()</code>, are a complete inventory of what the app does. Finding the code to change is a lookup, not a search.</dd>
    <dt>Shared rules cannot be forgotten</dt><dd>They wrap every request. A new endpoint is locked, audited and logged without anyone, human or model, adding a line.</dd>
    <dt>Small files, small context</dt><dd>A feature is three short files. An agent reads only those, and keeps the rest of its working memory for the task.</dd>
    <dt>The compiler checks the wiring</dt><dd><code>send</code> returns the type the request declares. A wrong result type is an error the agent sees and fixes itself.</dd>
  </dl>
</div></section>

<section id="pipeline"><div class="wrap">
  <div class="section-head">
    <p class="kicker">The pipeline</p>
    <h2>Rules you write once and cannot forget.</h2>
    <p class="lede">Every request passes through the same steps on its way to the handler and on its way back. They are called behaviors. Three come with the library; your own (permissions, rate limits, timing) take a dozen lines.</p>
  </div>
  <div class="panel" data-motion="scale">
    <figure class="wide-figure">
      ${pipelineSvg('tokens')}
      <figcaption>Behaviors run outermost first. The handler does its work once, and the result (or the error) travels back out through each of them.</figcaption>
    </figure>
    <div class="table-wrap"><table>
      <thead><tr><th>Behavior</th><th>A request opts in with</th><th>What you get</th></tr></thead>
      <tbody>
        <tr><td><code>MutexBehavior</code></td><td><code>mutexKey()</code></td><td>Two commands on the same thing never run at once. The second is refused straight away; locks are always released.</td></tr>
        <tr><td><code>AuditBehavior</code></td><td><code>auditInfo()</code></td><td>One record of who did what, success or failure, with secrets redacted. A failed write never changes the outcome.</td></tr>
        <tr><td><code>LoggingBehavior</code></td><td>nothing</td><td>One line per request: its name, whether it worked, how long it took.</td></tr>
      </tbody>
    </table></div>
  </div>
</div></section>

<section id="agents" data-ground="accent"><div class="wrap">
  <div class="agents-slab">
    <div class="stack">
      <h2>Works with AI coding agents out of the box.</h2>
      <p>Paste this into your project's <code>AGENTS.md</code> (or <code>CLAUDE.md</code>). It tells a coding agent where features live, how to add one, and what never to do, in about forty lines.</p>
      <p>The library also carries its whole manual as one plain-text file, so the agent can read how it works without leaving your repository.</p>
      <div class="links">
        <a href="llms.txt">llms.txt</a>
        <a href="llms-full.txt">llms-full.txt</a>
        <a href="docs/ai-coding-agents.html">Why this suits agents</a>
      </div>
    </div>
    <div class="snippet" data-ground="surface">${codeBlockHtml(input.agentsSnippet, 'md').replace('<div class="code"', '<div class="code" data-tall')}</div>
  </div>
</div></section>

<section id="growth"><div class="wrap">
  <div class="split growth">
    <div>
      <p class="display">1 folder</p>
      <p class="lede">is what a new feature costs, whether it is your tenth or your thousandth.</p>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>You want to</th><th>You touch</th></tr></thead>
      <tbody>
        <tr><td>Add a feature</td><td>One new folder (three files), one registration line, usually one route</td></tr>
        <tr><td>Change how a feature works</td><td>That feature's handler and its test</td></tr>
        <tr><td>Find where something happens</td><td>The folder named after it</td></tr>
        <tr><td>Add a rule to every feature</td><td>One new behavior, added in one place</td></tr>
        <tr><td>Delete a feature</td><td>Its folder, its registration line, its route</td></tr>
        <tr><td>Let an AI agent use a feature</td><td>One catalogue entry</td></tr>
      </tbody>
      <caption>Nothing in this table grows with the number of features you already have. <a href="docs/vertical-slices.html">How the layout works</a></caption>
    </table></div>
  </div>
</div></section>

<section id="agentic" data-ground="alt"><div class="wrap">
  <div class="section-head">
    <p class="kicker">The agentic interface</p>
    <h2>Then let AI use the app, through the same door.</h2>
    <p class="lede">Everything your app can do is already a list of named, typed requests. That is almost exactly what a model needs to use a tool. Describe each one once and the app gains two new doors: a chat assistant inside it, and an MCP endpoint for agents outside it.</p>
  </div>
  <figure class="wide-figure" data-motion="scale">
    ${doorsSvg('tokens')}
    <figcaption>A person, an in-app assistant and an outside agent all send the same Commands and Queries. None of them can skip the lock, the audit record or your permission rules.</figcaption>
  </figure>
  <div class="doors-grid">
    <dl class="facts reasons">
      <dt>Self-aware</dt><dd>The app can describe what it can do. An agent that connects asks for the list; it does not scrape pages or wait to be told.</dd>
      <dt>Self-maintaining</dt><dd>Agents can run day-to-day operations safely, because every action goes through the one audited door. Reads run at once. Changes wait for a person to confirm.</dd>
      <dt>Honest about it</dt><dd>The app does not rewrite itself or run without people. One test compares the tool list with what the mediator has registered, so a feature can never be half added. <a href="docs/agentic-interface.html">Read how to build both doors</a></dd>
    </dl>
    ${AIRES_HTML}
  </div>
</div></section>

<section id="try"><div class="wrap">
  <div class="split try">
    <div class="stack">
      <p class="kicker">Try it</p>
      <h2>See it run in a minute.</h2>
      <p>The repository includes a small notes app: four features, an HTTP door, a chat door and an MCP door on one pipeline. The tour runs in one process and needs no port.</p>
      ${codeBlockHtml('git clone https://github.com/garkpit/GarkpitMediator.git\ncd GarkpitMediator\nbun install\nbun run example', 'sh')}
      <p>On the right is what it printed when this page was built.</p>
    </div>
    <div data-motion="rise">${codeBlockHtml(input.tourOutput, 'text')}</div>
  </div>
</div></section>

<section id="limits" class="limits" data-ground="inverse"><div class="wrap">
  <div class="split">
    <div class="stack">
      <h2>Read this before you adopt it.</h2>
      <p>Small things done plainly. These are the edges.</p>
    </div>
    <dl class="facts">
      <dt>No npm package</dt><dd>You copy the source into your project and note the commit. Nothing changes underneath you; taking a newer version is your decision.</dd>
      <dt>Locks are per process</dt><dd>The built-in lock lives in memory. It does not coordinate across several servers. For that, write a behavior that takes the lock from your database.</dd>
      <dt>Class names matter</dt><dd>Handlers are found by class name, which keeps hot reload working. A minifier must not rename classes in a server bundle.</dd>
      <dt>It stays small</dt><dd>No dependency injection container, no events, no validation library, no queues. One request, one handler, one pipeline.</dd>
      <dt>No support</dt><dd>A personal project shared as it is, under the MIT licence. Not a product of, or endorsed by, any employer.</dd>
    </dl>
  </div>
</div></section>

<section id="guides"><div class="wrap">
  <div class="section-head">
    <p class="kicker">Documentation</p>
    <h2>${COUNT_WORDS[GUIDES.length] ?? String(GUIDES.length)} guides, every sample compiled.</h2>
    <p class="lede">The TypeScript on these pages is checked against the real source on every build, and the API reference is checked export by export. If the code changes and a page does not, the build fails.</p>
  </div>
  <ol class="guide-list">
${guides}
  </ol>
  <p class="also">Also: a one-page <a href="docs/cheatsheet/GarkpitMediator-CheatSheet.html">cheat sheet</a> (<a href="docs/cheatsheet/GarkpitMediator-CheatSheet.pdf">PDF</a>), the <a href="docs/example-notes.html">example app</a>, and all ${stats.exports} exports in the <a href="docs/api-reference.html">API reference</a>.</p>
</div></section>

</main>
`;
}
