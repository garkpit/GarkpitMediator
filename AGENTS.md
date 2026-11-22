# AGENTS.md: GarkpitMediator

A small CQRS mediator library (`src/`) plus its documentation, a runnable example and a static docs
site. Read `README.md` first; the whole manual in one file is `llms-full.txt`.

## Rules

- Bun and TypeScript only. Run `bun run check` before every commit: it type-checks, runs every test,
  compiles the documentation samples and checks the generated files. No GitHub Actions workflows.
- **`src/` is frozen.** Other projects carry byte-identical copies of it. Do not change it as part of
  documentation or site work. A real library change is its own commit, with a version bump in
  `package.json` and an entry in `CHANGELOG.md`.
- Everything in this repository is public. No local paths, machine names, employer names or personal
  details in any tracked file.
- Add no dependencies. The docs, example and site tooling use only Bun and the TypeScript compiler.

## Documentation

- The guides are `docs/*.md`, listed in reading order in `scripts/lib/manifest.ts`. A new guide needs an
  entry there and a link in `docs/README.md`.
- Every ```` ```ts ```` block is compiled against `src/` by `bun run docs:check`. Names a sample uses but
  does not define go in a hidden `<!-- check:prelude … -->` comment directly above it. Mark a block
  `ts nocheck` only when it cannot compile here (it needs another framework), and say so in the text.
- `docs/api-reference.md` must have a `### \`Name\`` heading for every export and for nothing else.
- Write for a smart newcomer: say what a thing is before naming it, plain words, British spelling
  (the API's own word "behavior" keeps its spelling). The check rejects a list of filler words.

## Generated files: never edit by hand

| Files | Made from | Command |
|---|---|---|
| `llms.txt`, `llms-full.txt` | `docs/*.md`, `scripts/lib/manifest.ts` | `bun run docs` |
| `docs/images/*.svg` | `site/diagrams.ts` | `bun run docs` |
| the snippet block in `docs/ai-coding-agents.md` | `docs/snippets/AGENTS.md` | `bun run docs` |
| `docs/cheatsheet/GarkpitMediator-CheatSheet.{md,html,pdf}` | `scripts/cheatsheet/data.ts` | `bun run cheatsheet` |
| `dist/site/` (not committed) | all of the above, `site/` | `bun run site` |

## The site

- `site/kit/` is a copied-in design kit (see its `SOURCE.md`); site-specific styles are `site/site.css`.
  Colours and fonts come only from the kit's tokens.
- The landing page is `site/landing.ts`. Its code sample is the real file `site/content/hero.ts`, which
  is type-checked.
- Wording about the companion library, Aires, lives in exactly two places: `site/aires.ts` and the
  block between `AIRES:START` and `AIRES:END` in `docs/agentic-interface.md`. A test enforces this.
- `bun scripts/site.ts publish --confirm-public` pushes the built site to the `gh-pages` branch. It
  makes the site public: run it only when the repository owner has said to.

## The example

`examples/notes` is a vertical-slice app: one folder per feature under `src/features/notes/`, each with
a request class, a handler and a test. Adding a feature there also needs a line in
`src/features/notes/index.ts` and an entry in `src/agent/catalogue.ts`; a test fails until both exist.
