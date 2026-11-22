// The chat door, without the chat. A model that can call tools is given `toolDefinitions()`; each
// tool call it makes comes back through `call()`. A Query runs at once. A Command does not: it
// becomes a proposal a person must confirm, and only `confirm()` sends it. Either way the request
// travels the same pipeline (lock, audit, log) as one sent by a button on a page.
import type { MediatorPort, Request as MediatorRequest, RequestContext } from '@garkpit/mediator';
import { ValidationError } from '../errors';
import { catalogue, findTool, type Tool } from './catalogue';

export interface Proposal {
  id: string;
  tool: string;
  input: unknown;
}

export type ToolOutcome =
  | { status: 'done'; data: unknown }
  | { status: 'needs-confirmation'; proposal: Proposal };

export class AssistantDoor {
  private readonly pending = new Map<string, { proposal: Proposal; request: MediatorRequest<unknown> }>();
  private nextProposal = 1;

  constructor(private readonly mediator: MediatorPort, private readonly tools: readonly Tool[] = catalogue) {}

  /** What to hand a chat model as its tools. Rename the keys to whatever your model's API expects. */
  toolDefinitions(): Array<Pick<Tool, 'name' | 'description' | 'inputSchema'>> {
    return this.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  }

  /** One tool call from the model. The input is validated here, before anyone is asked to confirm it. */
  async call(name: string, input: unknown, ctx: RequestContext): Promise<ToolOutcome> {
    const tool = findTool(name);
    if (!tool) throw new ValidationError(`There is no tool called "${name}".`);
    const request = tool.build(input);
    if (tool.kind === 'query') {
      return { status: 'done', data: await this.mediator.send(request, { ...ctx, audit: { via: 'assistant-chat' } }) };
    }
    const proposal: Proposal = { id: `p${this.nextProposal++}`, tool: name, input };
    this.pending.set(proposal.id, { proposal, request });
    return { status: 'needs-confirmation', proposal };
  }

  /** A person said yes. `ctx.actor` is that person, and the audit row records how the command arrived. */
  async confirm(proposalId: string, ctx: RequestContext): Promise<unknown> {
    const entry = this.pending.get(proposalId);
    if (!entry) throw new ValidationError(`Proposal "${proposalId}" does not exist or was already decided.`);
    this.pending.delete(proposalId);
    return this.mediator.send(entry.request, { ...ctx, audit: { via: 'assistant-chat', proposalId } });
  }

  /** A person said no. Nothing is sent. */
  reject(proposalId: string): boolean {
    return this.pending.delete(proposalId);
  }
}
