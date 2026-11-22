// The cheat sheet's content. GarkpitMediator-CheatSheet.md, .html and .pdf are all generated from
// this one file (bun run cheatsheet), and bun run check fails when they fall out of step with it or
// when a name listed under "api" is no longer exported.

export interface Row {
  /** Shown in code type. For `api` rows this must be a real export. */
  name: string;
  text: string;
}

export interface Section {
  title: string;
  intro?: string;
  /** A code sample, with its language for highlighting. */
  code?: { language: 'ts' | 'sh' | 'json' | 'text'; source: string };
  rows?: Row[];
  /** Short bullet points. Inline `code` is allowed. */
  points?: string[];
}

export const sheet = {
  name: 'GarkpitMediator',
  title: 'GarkpitMediator cheat sheet',
  lede: 'A zero-dependency CQRS mediator for TypeScript. Every feature is a named Command or Query with one handler, sent through one pipeline of behaviors.',
  repoUrl: 'https://github.com/garkpit/GarkpitMediator',

  // The first two sections share the top row of the HTML sheet; the rest flow in columns.
  sections: [
    {
      title: 'Install: copy it in',
      intro: 'No npm package. Copy the source into your project and record the commit.',
      code: {
        language: 'sh',
        source: `git clone https://github.com/garkpit/GarkpitMediator.git ../GarkpitMediator
mkdir -p packages/mediator
git -C ../GarkpitMediator archive HEAD src package.json tsconfig.json \\
  LICENSE README.md llms-full.txt | tar -x -C packages/mediator
# package.json: "workspaces": ["packages/*"],
#   "dependencies": { "@garkpit/mediator": "workspace:*" }
bun install`
      }
    },
    {
      title: 'The whole shape',
      code: {
        language: 'ts',
        source: `import { Command, Query, createMediator, LoggingBehavior, MutexBehavior } from '@garkpit/mediator';

// A Query reads.
class GetNote extends Query<Note | undefined> {
  constructor(readonly id: string) { super(); }
}

// A Command changes something. Methods opt it in to the lock and the audit trail.
class RenameNote extends Command<Note> {
  constructor(readonly id: string, readonly title: string) { super(); }
  mutexKey() { return \`note:\${this.id}\`; }
  auditInfo() { return { action: 'note.rename', resourceId: this.id, details: { title: this.title } }; }
}

// Behaviors wrap every request, outermost first. One handler per request class.
const mediator = createMediator({ behaviors: [new MutexBehavior(), audit, new LoggingBehavior()] });
mediator.register(GetNote, { handle: async (query) => notes.get(query.id) });
mediator.register(RenameNote, new RenameNoteHandler(store));

// Send from anywhere. The result is typed: here, a Note.
const note = await mediator.send(new RenameNote('n1', 'Weekly shop'), { actor: 'priya' });`
      }
    },
    {
      title: 'Core API',
      rows: [
        { name: 'Command', text: 'Base class for a request that changes something. Result type defaults to void.' },
        { name: 'Query', text: 'Base class for a request that only reads.' },
        { name: 'Handler', text: 'An object with handle(request): Promise<Result>.' },
        { name: 'createMediator', text: 'Builds a Mediator with the given behaviors, outermost first.' },
        { name: 'Mediator', text: 'register(Class, handler), send(request, ctx), use(behavior), registeredRequestTypes().' },
        { name: 'RequestContext', text: '{ actor, correlationId?, audit?, secrets? }: who is asking. Goes to behaviors, not handlers.' },
        { name: 'MediatorPort', text: 'The three-method interface to depend on in library code.' },
        { name: 'PipelineBehavior', text: 'invoke(request, next, ctx): your own step around every request.' }
      ]
    },
    {
      title: 'Built-in behaviors',
      rows: [
        { name: 'MutexBehavior', text: 'Request has mutexKey(): string | string[]. One at a time per key, all-or-nothing, fails fast with MutexHeldError. In-process only.' },
        { name: 'AuditBehavior', text: 'Request has auditInfo(). One row per request, ok or fail, secrets redacted. Needs appendEntry and mapError. A failed write never changes the result.' },
        { name: 'LoggingBehavior', text: 'Every request. One line: [mediator] Name ok (1.2ms). Pass a sink to redirect.' }
      ],
      points: ['Order is outermost first. With `[mutex, audit, logging]` a command refused by the lock leaves no audit row; put audit first to record refusals.']
    },
    {
      title: 'HTTP envelope',
      intro: 'From @garkpit/mediator/http. Standard Request and Response objects.',
      code: {
        language: 'ts',
        source: `import { fail, ok, readBoundedBody }
  from '@garkpit/mediator/http';

ok(note);                // 200 {"ok":true,"data":…}
ok(note, { status: 201 });
fail({ code: 'NOT_FOUND', message: 'No such note.' });
                         // 404 {"ok":false,"error":…}
fail(error, { table: MY_STATUS_TABLE });
await readBoundedBody(request, 16 * 1024);
                         // or RequestBodyLimitError`
      },
      points: ['`VALIDATION_FAILED` 400 · `UNAUTHORIZED` 401 · `NOT_FOUND` 404 · `CONFLICT` 409 · `MUTEX_HELD` 409 · `PRECONDITION_FAILED` 412 · `INTERNAL` 500 · `UPSTREAM_FAILED` 502 · unknown 500']
    },
    {
      title: 'Recipe: add a feature',
      points: [
        'New folder `src/features/<area>/<verb-noun>/` with `VerbNoun.ts` (the request), `VerbNounHandler.ts` and `VerbNoun.test.ts`.',
        'One line in the area\'s `index.ts`: `mediator.register(VerbNoun, new VerbNounHandler(deps))`.',
        'A thin route: parse the input, `mediator.send(request, { actor })`, then `ok(data)` or `fail(error)`.',
        'Needs a lock? Add `mutexKey()`. Needs a record? Add `auditInfo()`. Nothing else changes.',
        'Using an agent catalogue? Add its entry; the parity test fails until you do.'
      ]
    },
    {
      title: 'Recipe: your own behavior',
      code: {
        language: 'ts',
        source: `class PermissionBehavior implements PipelineBehavior {
  async invoke<T extends Request<R>, R>(
    request: T, next: Next<R>, ctx?: RequestContext
  ): Promise<R> {
    // Throw to stop here: the handler never runs.
    if (!(await allowed(request, ctx))) {
      throw new ForbiddenError();
    }
    // Or carry on down the pipeline.
    return next();
  }
}`
      },
      points: ['Write behaviors as classes: each class may be used once per mediator, and they are told apart by class name.']
    },
    {
      title: 'Recipe: an agent tool catalogue',
      code: {
        language: 'ts',
        source: `// One entry per request. This test keeps it honest:
expect(catalogue.map((tool) => tool.name).sort())
  .toEqual([...mediator.registeredRequestTypes()]);

// Record how a request arrived:
mediator.send(request, {
  actor,
  audit: { via: 'assistant-chat', proposalId }
});`
      },
      points: ['Queries run at once; Commands become proposals a person confirms. See the agentic interface guide.']
    },
    {
      title: 'Gotchas',
      points: [
        'Handlers are keyed by **class name**. Names must be unique per mediator, and a server bundle must keep them: `bun build --minify --keep-names`, esbuild `keepNames`, Terser `keep_classnames`.',
        'The lock lives in one process. Build one `MutexBehavior` and reuse it. It does not coordinate across servers.',
        'Hot reload re-runs registrations: pass `{ allowReplace: true }` to `register` and `use` in development only.',
        'Handlers do not receive the context. Put what they need (an owner id) on the request.',
        'Sharing request classes with browser code? Import from `@garkpit/mediator/Request`, which has no imports.',
        'The exported `Request` class hides the Fetch API\'s if imported by name. Extend `Command` or `Query`, or alias it.',
        'A handler that sends another locked command on the same key gets `MutexHeldError`. Declare every key up front with an array.'
      ]
    },
    {
      title: 'In this repository',
      rows: [
        { name: 'bun run check', text: 'Typecheck, unit tests, example tests, docs check, cheat-sheet drift.' },
        { name: 'bun run example', text: 'A narrated tour of examples/notes: HTTP, chat and MCP doors on one pipeline.' },
        { name: 'bun run docs', text: 'Regenerate llms.txt, llms-full.txt and the diagrams.' },
        { name: 'bun run cheatsheet', text: 'Regenerate this sheet (Markdown, HTML, PDF).' },
        { name: 'bun run site', text: 'Build the documentation site into dist/site; site:serve previews it.' }
      ]
    }
  ] satisfies Section[],

  /** Names in these sections' rows are checked against the library's real exports. */
  apiSections: ['Core API', 'Built-in behaviors'],

  guides: [
    ['Getting started', 'getting-started'],
    ['Commands and Queries', 'commands-and-queries'],
    ['Behaviors', 'behaviors'],
    ['HTTP envelope', 'http'],
    ['Vertical slices', 'vertical-slices'],
    ['AI coding agents', 'ai-coding-agents'],
    ['Agentic interface', 'agentic-interface'],
    ['API reference', 'api-reference'],
    ['FAQ', 'faq']
  ] as const
};
