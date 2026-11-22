# The agentic interface: an app that AI can read and operate

An app built on the mediator has an unusual property: everything it can do is already a list of named,
typed requests. That is almost exactly what an AI model needs in order to use a tool: a name, a
description and the inputs. So with a small amount of extra code the app gains two new doors beside
its web pages:

- a **chat door**: an assistant inside the app that can look things up and propose changes on a
  person's behalf;
- an **MCP door**: an endpoint that outside AI agents (Claude, Codex, your own) can connect to. MCP is
  the Model Context Protocol, an open standard for giving AI applications tools to call.

Both doors send the same Commands and Queries, through the same locks, audit trail and logging, as a
button on a page does.

![Three doors, one pipeline: web pages, a chat assistant and outside agents over MCP all send the same Commands and Queries through the mediator's behaviors to the handlers.](images/doors.svg)

## What "self-aware" and "self-maintaining" mean here

These are big words, so here is exactly what is meant by them and what is not.

**Self-aware** means the app can describe what it can do. `mediator.registeredRequestTypes()` lists
every capability by name, and a catalogue adds a sentence and an input schema for each. An agent that
connects does not have to be told what is possible, and does not have to scrape pages to find out. It
asks.

**Self-maintaining** means agents can safely run the app's day-to-day operations, because every action
they take goes through the one audited, locked door that people use. An agent cannot skip a permission
check or forget the audit row, because those are not its to skip: they are in the pipeline. And when a
coding agent adds a feature, the new Command is one catalogue entry away from being usable by every
other agent.

It does **not** mean the app rewrites itself, fixes its own bugs unattended, or needs no people. People
still decide what gets built and confirm what gets changed.

## Step 1: a tool catalogue

A catalogue is a list with one entry per request: its class, a description a model can read, and a
schema for its inputs. Each entry builds its request with the same `parse` function the HTTP route
uses, so there is one set of validation rules, not two.

```ts
import { Command as BaseCommand, type Request as MediatorRequest } from '@garkpit/mediator';

export interface Tool {
  /** The request class name: the same string the mediator keys handlers by. */
  name: string;
  /** Queries only read. Commands change something. */
  kind: 'query' | 'command';
  description: string;
  /** A JSON Schema for the input object. */
  inputSchema: { type: 'object'; properties: Record<string, { type: string; description: string }>; required: string[] };
  /** Untyped input in, validated request out. */
  build(input: unknown): MediatorRequest<unknown>;
}

interface RequestClass {
  name: string;
  prototype: MediatorRequest<unknown>;
  parse(input: unknown): MediatorRequest<unknown>;
}

function tool(request: RequestClass, description: string, fields: Record<string, string>): Tool {
  return {
    name: request.name,
    // Taken from the class, so it cannot disagree with the code.
    kind: request.prototype instanceof BaseCommand ? 'command' : 'query',
    description,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(Object.entries(fields).map(([field, text]) => [field, { type: 'string', description: text }])),
      required: Object.keys(fields)
    },
    build: (input) => request.parse(input)
  };
}

export const catalogue: readonly Tool[] = [
  tool(GetNote, 'Read one note by its id.', { id: 'The note id, for example "n1".' }),
  tool(RenameNote, 'Change the title of an existing note.', { id: 'The note id.', title: 'The new title.' })
];
```

## Step 2: prove nothing is missing

One test keeps the catalogue honest. It fails when someone adds a feature without a tool, or leaves a
tool behind after deleting a feature:

```ts nocheck
test('the catalogue lists exactly the requests the mediator has handlers for', () => {
  expect(catalogue.map((tool) => tool.name).sort()).toEqual([...mediator.registeredRequestTypes()]);
});
```

If some requests should stay private to the app, keep a short written list of exclusions and subtract
it. The point is that leaving one out becomes a decision, not an accident.

## Step 3: the chat door

A chat model that supports tool calling is given the catalogue as its tools. When it calls one, the
call arrives at a small class that applies one rule: **reads run, changes wait for a person.**

```ts
import type { MediatorPort, RequestContext } from '@garkpit/mediator';

export type ToolOutcome =
  | { status: 'done'; data: unknown }
  | { status: 'needs-confirmation'; proposalId: string; tool: string; input: unknown };

export class AssistantDoor {
  private readonly pending = new Map<string, MediatorRequest<unknown>>();

  constructor(private readonly mediator: MediatorPort) {}

  /** One tool call from the model. */
  async call(name: string, input: unknown, ctx: RequestContext): Promise<ToolOutcome> {
    const tool = catalogue.find((t) => t.name === name);
    if (!tool) throw new Error(`There is no tool called "${name}".`);
    const request = tool.build(input); // validated now, before anyone is asked to confirm

    if (tool.kind === 'query') {
      return { status: 'done', data: await this.mediator.send(request, { ...ctx, audit: { via: 'assistant-chat' } }) };
    }
    const proposalId = crypto.randomUUID();
    this.pending.set(proposalId, request);
    return { status: 'needs-confirmation', proposalId, tool: name, input };
  }

  /** The person pressed Confirm. `ctx.actor` is that person. */
  async confirm(proposalId: string, ctx: RequestContext): Promise<unknown> {
    const request = this.pending.get(proposalId);
    if (!request) throw new Error('That proposal does not exist or was already decided.');
    this.pending.delete(proposalId);
    return this.mediator.send(request, { ...ctx, audit: { via: 'assistant-chat', proposalId } });
  }
}
```

What this gives you:

- The assistant can answer "which invoices are unpaid?" at once, because Queries change nothing.
- When it wants to change something it shows the person exactly what it proposes ("Rename note n1 to
  *Weekly shop*") and nothing happens until they agree.
- The confirmed command is recorded as the person's action, with `via: 'assistant-chat'` and the
  proposal id in the audit row's details, so you can always tell which changes arrived through the
  assistant.
- The command still takes its lock and passes every behavior. The assistant has no back door.

The class has no model in it on purpose. Connecting one is a few lines with whichever AI provider you
use: pass `catalogue` as the tool definitions, and route each tool call the model makes to
`door.call(...)`.

## Step 4: the MCP door

For agents outside your app, MCP needs two things from a server: a list of tools and a way to call one.
Both are short when you have a catalogue:

```ts
import type { MediatorPort, RequestContext } from '@garkpit/mediator';

export function listTools() {
  return catalogue.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: { readOnlyHint: tool.kind === 'query' } // tells the client which tools only read
  }));
}

export async function callTool(mediator: MediatorPort, name: string, input: unknown, ctx: RequestContext) {
  const tool = catalogue.find((t) => t.name === name);
  if (!tool) return { content: [{ type: 'text', text: `There is no tool called "${name}".` }], isError: true };
  try {
    const data = await mediator.send(tool.build(input), { ...ctx, audit: { via: 'mcp' } });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true };
  }
}
```

**This is a sketch of the two functions that matter, not a complete MCP server.** A real one also
handles the protocol's handshake, its transports and, above all, authentication, and for those you
should use the official MCP SDK for your language and call these two functions from its handlers.

[`examples/notes`](../examples/notes/README.md) goes one step further so you can try it: it wraps the
two functions in a minimal JSON-RPC handler (`src/agent/mcp.ts`), served both on standard input and
output and at `POST /mcp`. On 22 November 2026 that example was checked against the official MCP
TypeScript SDK client, version 1.32.2, over both transports: the client listed the four tools, created
a note and received a clean error for a missing one. It has no authentication and no sessions, and it
binds to your own machine only. Treat it as a demonstration.

## What the library provides for this

Nothing above needs a special "AI mode". These parts of the ordinary API are what make it short:

| Part | Role in an agentic interface |
|---|---|
| `Command` and `Query` | The read/write split tells a door which calls are safe to run unasked. |
| `registeredRequestTypes()` | The list a parity test compares the catalogue against. |
| `RequestContext.audit` | Records how a request arrived (`via`, a proposal id) without the Command knowing or caring. |
| `RequestContext.secrets` | Keeps a value a person typed for a tool (an API key, say) out of the audit row, whatever field it lands in. |
| `MediatorPort` | The small interface a door depends on, so the same door code works with any mediator of that shape. |
| Behaviors | Locks, audit and your permission rules apply to agents exactly as they apply to people. |

## Before you open a door

- **Decide who the actor is.** For the chat door it is the signed-in person. For MCP it is whoever the
  connection authenticated as. Never let a caller name its own actor.
- **Put permission checks in a behavior,** not in the door, so they hold for every way in.
- **Keep Queries pure.** A "read" that changes something would run without confirmation.
- **Think about what a Query can reveal.** Running unasked is fine for "list my notes" and wrong for
  "list every customer's card details". Give sensitive reads an `auditInfo()`, a permission rule, or
  leave them out of the catalogue.
- **Do not expose an unauthenticated MCP endpoint beyond your own machine.**

## Aires: the companion library

Everything on this page you can build yourself, and the example app does it in a few hundred lines. I
also use a fuller version of the same idea: **Aires**, a companion library I developed at work. It
generates both doors from an app’s Commands and Queries: an in-app chat assistant in which every change
is a proposal a person confirms, and an MCP endpoint for outside agents, with a check that fails when a
feature has no matching tool.

A free, open-source version is in the wings for when I get the chance. But you could simply describe it
to Claude Code and have it write one for you. That’s what I did. Opus 5.5 is that good. This page and
the code in [`examples/notes`](../examples/notes/README.md) give you (and Claude) the whole shape to
start from.

## Where next

- [`examples/notes`](../examples/notes/README.md): run `bun run example` and watch a person, an
  assistant and an MCP client change the same data through one pipeline.
- [Behaviors](behaviors.md): where to put the permission rules a door relies on.
