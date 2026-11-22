// The one list of guides, in reading order. The site navigation, llms.txt, llms-full.txt and the
// docs index are all built from it, and the docs check fails if a guide exists that is not listed.
import { join, resolve } from 'node:path';

export const REPO = resolve(import.meta.dir, '..', '..');
export const DOCS_DIR = join(REPO, 'docs');

export const PROJECT = {
  name: 'GarkpitMediator',
  packageName: '@garkpit/mediator',
  repoUrl: 'https://github.com/garkpit/GarkpitMediator',
  tagline: 'One front door for every feature.',
  summary:
    'A small, zero-dependency CQRS mediator for TypeScript web apps. Every feature is a named Command or Query with exactly one handler, sent through one pipeline of shared behaviors (locking, auditing, logging, or your own). The result is a codebase that people and AI coding agents can both find their way around as it grows, and an app whose capabilities can be handed to a chat assistant or an MCP server as tools.'
} as const;

/** The site icon, inline so no page asks the network for one. */
export const FAVICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="9" fill="#f1dfd5"/><rect x="6.5" y="6.5" width="19" height="19" rx="6" fill="#e3b29d"/><rect x="11.5" y="11.5" width="9" height="9" rx="3" fill="#b5502b"/></svg>')}`;

export interface Guide {
  slug: string;
  title: string;
  /** One line for indexes and llms.txt. */
  summary: string;
}

export const GUIDES: readonly Guide[] = [
  { slug: 'getting-started', title: 'Getting started', summary: 'Copy the library in, write your first Command and Query, add locking and an audit trail.' },
  { slug: 'commands-and-queries', title: 'Commands and Queries', summary: 'Request classes, handlers, registering, sending, and the request context that says who is asking.' },
  { slug: 'behaviors', title: 'Behaviors', summary: 'The pipeline around every request: the built-in lock, audit and logging behaviors, and how to write your own.' },
  { slug: 'http', title: 'The HTTP envelope and body limits', summary: 'ok and fail JSON responses, error codes and statuses, and reading a request body with a size limit.' },
  { slug: 'vertical-slices', title: 'Growing an app with vertical slices', summary: 'One folder per feature: the layout, the rules, and why a change costs the same at any size.' },
  { slug: 'ai-coding-agents', title: 'Working with AI coding agents', summary: 'Why this structure suits coding agents, the snippet for your AGENTS.md, and llms.txt.' },
  { slug: 'agentic-interface', title: 'The agentic interface', summary: 'Turn your Commands and Queries into tools for a chat assistant and an MCP server, through the same audited pipeline.' },
  { slug: 'api-reference', title: 'API reference', summary: 'Every export of @garkpit/mediator and @garkpit/mediator/http, checked against the source.' },
  { slug: 'faq', title: 'FAQ and gotchas', summary: 'Minifiers and class names, hot reload, locks across servers, browser imports, and what the library does not do.' }
];

export const guidePath = (slug: string) => join(DOCS_DIR, `${slug}.md`);
