// A sketch of the MCP door: enough of the Model Context Protocol's JSON-RPC to list the catalogue as
// tools and call them. It is here to show the shape, not to be a complete server; for production use
// the official MCP SDK for your language and keep only the two functions that matter, `listTools`
// and `callTool`. Transport is someone else's job: `handleMcpMessage` takes one parsed message and
// returns the reply (or null for a notification), so it works behind stdio or an HTTP route alike.
import type { RequestContext } from '@garkpit/mediator';
import type { App } from '../app';
import { toApiError } from '../errors';
import { catalogue, findTool } from './catalogue';

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export function listTools() {
  return catalogue.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    // A hint for the client: Queries never change anything.
    annotations: { readOnlyHint: t.kind === 'query' }
  }));
}

export async function callTool(app: App, name: string, input: unknown, ctx: RequestContext) {
  const tool = findTool(name);
  if (!tool) return { content: [{ type: 'text', text: `NOT_FOUND: there is no tool called "${name}".` }], isError: true };
  try {
    const data = await app.mediator.send(tool.build(input), { ...ctx, audit: { via: 'mcp' } });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  } catch (error) {
    const { code, message } = toApiError(error);
    return { content: [{ type: 'text', text: `${code}: ${message}` }], isError: true };
  }
}

interface JsonRpcMessage {
  jsonrpc?: unknown;
  id?: string | number | null;
  method?: unknown;
  params?: Record<string, unknown>;
}

export async function handleMcpMessage(app: App, message: unknown, ctx: RequestContext): Promise<object | null> {
  const { id, method, params } = (typeof message === 'object' && message !== null ? message : {}) as JsonRpcMessage;
  const reply = (result: object) => ({ jsonrpc: '2.0', id: id ?? null, result });
  const refuse = (code: number, text: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message: text } });

  if (typeof method !== 'string') return refuse(-32600, 'Not a JSON-RPC request.');
  // Notifications carry no id and get no reply.
  if (id === undefined) return null;

  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return reply({
        protocolVersion: typeof asked === 'string' && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'notes-example', version: '0.0.0' }
      });
    }
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: listTools() });
    case 'tools/call': {
      if (typeof params?.name !== 'string') return refuse(-32602, 'tools/call needs a tool name.');
      return reply(await callTool(app, params.name, params.arguments ?? {}, ctx));
    }
    default:
      return refuse(-32601, `Method not found: ${method}`);
  }
}
