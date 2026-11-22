# Growing an app with vertical slices

Most codebases start tidy and get harder to change as they grow. The usual cause is not bad code. It
is that one feature ends up spread across a routes folder, a services folder, a models folder and a
utils folder, so every change means finding and editing four files that also serve twenty other
features.

A **vertical slice** is the opposite arrangement: one folder per feature, holding everything that
feature needs. The mediator is what makes it practical, because a feature is then exactly one request
class and one handler.

## The layout

```tree
src/
  app.ts                          builds the mediator and its behaviors, registers every feature
  errors.ts                       typed errors, and the one function that maps them to error codes
  features/
    notes/
      index.ts                    one registration line per slice
      create-note/
        CreateNote.ts             the Command: its inputs, its lock key, its audit record
        CreateNoteHandler.ts      the only code that creates a note
        CreateNote.test.ts        sends CreateNote through the real pipeline
      rename-note/
        RenameNote.ts
        RenameNoteHandler.ts
        RenameNote.test.ts
      get-note/
        GetNote.ts                a Query
        GetNoteHandler.ts
        GetNote.test.ts
    billing/
      index.ts
      mark-invoice-paid/
        ...
  http/
    routes.ts                     thin: parse, send, wrap in ok/fail
```

This is the real layout of [`examples/notes`](../examples/notes/README.md). Open any slice there and
you will find these three files.

## The three files of a slice

**The request** says what the feature is, what it needs, and which shared rules apply to it.

```ts
// features/notes/rename-note/RenameNote.ts
import { Command, type AuditInfo, type HasAuditInfo, type HasMutexKey } from '@garkpit/mediator';

export interface Note {
  id: string;
  title: string;
}

export class RenameNote extends Command<Note> implements HasMutexKey, HasAuditInfo {
  constructor(readonly id: string, readonly title: string) {
    super();
  }

  mutexKey(): string {
    return `note:${this.id}`;
  }

  auditInfo(): AuditInfo {
    return { action: 'note.rename', resourceId: this.id, details: { title: this.title } };
  }

  /** The one place untyped input becomes a RenameNote. Routes and agent tools both call it. */
  static parse(input: unknown): RenameNote {
    const { id, title } = (input ?? {}) as { id?: unknown; title?: unknown };
    if (typeof id !== 'string' || id === '') throw new Error('"id" must be a non-empty string.');
    if (typeof title !== 'string' || title.trim() === '') throw new Error('"title" must be a non-empty string.');
    return new RenameNote(id, title.trim());
  }
}
```

**The handler** does the work, and is the only place that does.

```ts
// features/notes/rename-note/RenameNoteHandler.ts
import type { Handler } from '@garkpit/mediator';

export interface NotesStore {
  update(id: string, changes: { title: string }): Promise<Note | undefined>;
}

export class RenameNoteHandler implements Handler<RenameNote, Note> {
  constructor(private readonly store: NotesStore) {}

  async handle(command: RenameNote): Promise<Note> {
    const note = await this.store.update(command.id, { title: command.title });
    if (!note) throw new Error(`Note ${command.id} does not exist.`);
    return note;
  }
}
```

**The test** sends the request through the real mediator, behaviors included, so it proves what a real
caller would see.

```ts nocheck
// features/notes/rename-note/RenameNote.test.ts
import { expect, test } from 'bun:test';
import { createApp } from '../../../app';
import { CreateNote } from '../create-note/CreateNote';
import { RenameNote } from './RenameNote';

test('RenameNote renames the note and audits the change', async () => {
  const app = createApp();
  const { id } = await app.mediator.send(new CreateNote('Draft', ''), { actor: 'priya' });

  expect(await app.mediator.send(new RenameNote(id, 'Final'), { actor: 'priya' })).toMatchObject({ id, title: 'Final' });
  expect(app.auditLog.at(-1)).toMatchObject({ action: 'note.rename', outcome: 'ok', resourceId: id });
});
```

Registration is one line per slice, in the feature area's `index.ts`:

```ts
// features/notes/index.ts
import type { MediatorPort } from '@garkpit/mediator';

export function registerNotes(mediator: MediatorPort, store: NotesStore): void {
  mediator.register(CreateNote, new CreateNoteHandler(store));
  mediator.register(RenameNote, new RenameNoteHandler(store));
  mediator.register(GetNote, new GetNoteHandler(store));
}
```

## The rules that keep it tidy

1. **Dependencies point inward.** Routes know the mediator and the request classes. Handlers know the
   things they are given (a store, a mail sender). Nothing inner imports anything outer: a handler
   never sees an HTTP request, and a route never touches the database.
2. **A slice does one thing, and its name says what.** When a handler starts doing a second thing,
   that is a second slice.
3. **Slices do not call each other's handlers.** If two slices need the same logic, move it into a
   plain function both import. If one feature must trigger another, the caller (a route, a job) sends
   two requests.
4. **Shared rules live in behaviors, never in handlers.** No handler takes a lock, writes an audit row
   or logs its own timing.
5. **Routes are thin.** Parse, send, wrap. If a route has an `if` about business rules, the rule
   belongs in a handler.

## What a change touches

This is the point of the whole arrangement. As the app doubles in size, the cost of one change stays
the same:

| You want to | You touch |
|---|---|
| Add a feature | One new folder (three files), one registration line, usually one route |
| Change how a feature works | That feature's handler and its test |
| Find where something happens | The folder named after it |
| Add a rule to every feature (permissions, rate limits) | One new behavior, added in one place |
| Delete a feature | Its folder, its registration line, its route |
| Give an AI agent access to a feature | One catalogue entry: see [the agentic interface](agentic-interface.md) |

Nothing in that table grows with the number of features you already have.

## Keep a list you can trust

`mediator.registeredRequestTypes()` returns the name of every request that has a handler. Use it to
keep promises about the whole app in a test, for instance "every Command is audited" or "every request
has an entry in the assistant's tool catalogue". A test like that fails the moment someone adds a
feature and forgets the other half.

```ts
// Every registered request has a catalogue entry, and the other way round.
expect(catalogue.map((tool) => tool.name).sort()).toEqual([...mediator.registeredRequestTypes()]);
```

## Where next

- [Working with AI coding agents](ai-coding-agents.md): why this layout suits them, and the snippet
  that teaches them to keep it.
- [The agentic interface](agentic-interface.md): turning the list of slices into tools.
