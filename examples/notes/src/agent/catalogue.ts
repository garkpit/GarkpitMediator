// The tool catalogue: one entry per Command or Query, in words a model (or a person) can read.
// The chat door and the MCP door are both generated from this list, and a test proves it lists
// exactly what the mediator has registered, so the two can never drift apart.
import { Command, type Request as MediatorRequest } from '@garkpit/mediator';
import { CreateNote, GetNote, ListNotes, RenameNote } from '../features/notes';

/** A JSON Schema object describing a tool's input. */
export interface InputSchema {
  type: 'object';
  properties: Record<string, { type: 'string'; description: string }>;
  required: string[];
  additionalProperties: false;
}

export interface Tool {
  /** The request class name: the same string the mediator keys its handlers by. */
  name: string;
  /** Queries only read. Commands change something, so the chat door asks a person first. */
  kind: 'query' | 'command';
  description: string;
  inputSchema: InputSchema;
  /** Turns untyped input into the request, or throws a ValidationError. */
  build(input: unknown): MediatorRequest<unknown>;
}

interface RequestClass {
  name: string;
  prototype: MediatorRequest<unknown>;
  parse(input: unknown): MediatorRequest<unknown>;
}

function tool(request: RequestClass, description: string, fields: Record<string, string>, optional: string[] = []): Tool {
  return {
    name: request.name,
    kind: request.prototype instanceof Command ? 'command' : 'query',
    description,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(Object.entries(fields).map(([field, text]) => [field, { type: 'string', description: text }])),
      required: Object.keys(fields).filter((field) => !optional.includes(field)),
      additionalProperties: false
    },
    build: (input) => request.parse(input)
  };
}

export const catalogue: readonly Tool[] = [
  tool(CreateNote, 'Create a new note.', { title: 'The note title, up to 200 characters.', body: 'The note text.' }, ['body']),
  tool(GetNote, 'Read one note by its id.', { id: 'The note id, for example "n1".' }),
  tool(ListNotes, 'List every note, most recently changed first.', {}),
  tool(RenameNote, 'Change the title of an existing note.', { id: 'The note id.', title: 'The new title.' })
];

export function findTool(name: string): Tool | undefined {
  return catalogue.find((t) => t.name === name);
}
