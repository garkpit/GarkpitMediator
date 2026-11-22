# Commands and Queries

Every request your app handles is one of two things. A **Query** reads and returns data. A **Command**
changes something. The split is called CQRS (Command Query Responsibility Segregation), and in this
library it is nothing more than two base classes and a habit: name each thing the app can do, and say
which kind it is.

## Writing a request class

A request is a class that extends `Query<R>` or `Command<R>`. `R` is the type its handler returns.
The constructor carries the inputs.

```ts
import { Command, Query } from '@garkpit/mediator';

interface Invoice {
  id: string;
  customer: string;
  totalPence: number;
  paid: boolean;
}

// Reads one invoice.
export class GetInvoice extends Query<Invoice> {
  constructor(readonly id: string) {
    super();
  }
}

// Reads many, with a filter.
export class ListInvoices extends Query<Invoice[]> {
  constructor(readonly filter: { customer?: string; unpaidOnly?: boolean } = {}) {
    super();
  }
}

// Changes one, and returns the new state.
export class MarkInvoicePaid extends Command<Invoice> {
  constructor(readonly id: string, readonly paidOn: Date) {
    super();
  }
}

// Changes something and returns nothing: Command's result type defaults to void.
export class SendInvoiceReminder extends Command {
  constructor(readonly id: string) {
    super();
  }
}
```

Good request classes share a few traits:

- **The name is verb then noun, and says what happens.** `MarkInvoicePaid`, not `InvoiceUpdate` or
  `HandleInvoice`. The list of class names should read like a description of the app.
- **The inputs are already valid.** Parse untyped input (a JSON body, a tool call) before you construct
  the request, so a handler never has to wonder whether `id` is really a string. A static `parse`
  method on the class is a tidy home for that; see [vertical slices](vertical-slices.md).
- **They hold data, not behaviour.** No database handles, no services. A request should be something
  you could print.
- **One name, once.** The mediator finds handlers by class name, so two request classes in one app
  cannot share a name. See the [FAQ](faq.md#why-are-handlers-keyed-by-class-name) for why.

## Writing a handler

A handler is any object with a `handle` method that takes the request and returns a promise of the
result. Use a class when the handler needs things (a database, a mail sender), so they arrive through
the constructor and tests can swap them:

<!-- check:prelude
import { Command, Query } from '@garkpit/mediator';
interface Invoice { id: string; customer: string; totalPence: number; paid: boolean }
class GetInvoice extends Query<Invoice> { constructor(readonly id: string) { super(); } }
class MarkInvoicePaid extends Command<Invoice> { constructor(readonly id: string, readonly paidOn: Date) { super(); } }
-->
```ts
import type { Handler } from '@garkpit/mediator';

interface InvoiceStore {
  find(id: string): Promise<Invoice | undefined>;
  save(invoice: Invoice): Promise<void>;
}

class InvoiceNotFoundError extends Error {}

export class GetInvoiceHandler implements Handler<GetInvoice, Invoice> {
  constructor(private readonly store: InvoiceStore) {}

  async handle(query: GetInvoice): Promise<Invoice> {
    const invoice = await this.store.find(query.id);
    if (!invoice) throw new InvoiceNotFoundError(`Invoice ${query.id} does not exist.`);
    return invoice;
  }
}

export class MarkInvoicePaidHandler implements Handler<MarkInvoicePaid, Invoice> {
  constructor(private readonly store: InvoiceStore) {}

  async handle(command: MarkInvoicePaid): Promise<Invoice> {
    const invoice = await this.store.find(command.id);
    if (!invoice) throw new InvoiceNotFoundError(`Invoice ${command.id} does not exist.`);
    const paid = { ...invoice, paid: true };
    await this.store.save(paid);
    return paid;
  }
}
```

A handler knows about the things it needs and nothing about how it was called. It never sees an HTTP
request, a cookie or a response. That is what lets the same handler serve a web page, a command-line
tool, a scheduled job and an AI agent.

## Registering and sending

<!-- check:prelude
import { Command, Query, type Handler } from '@garkpit/mediator';
interface Invoice { id: string; customer: string; totalPence: number; paid: boolean }
class GetInvoice extends Query<Invoice> { constructor(readonly id: string) { super(); } }
class MarkInvoicePaid extends Command<Invoice> { constructor(readonly id: string, readonly paidOn: Date) { super(); } }
interface InvoiceStore { find(id: string): Promise<Invoice | undefined>; save(invoice: Invoice): Promise<void> }
declare class GetInvoiceHandler implements Handler<GetInvoice, Invoice> { constructor(store: InvoiceStore); handle(q: GetInvoice): Promise<Invoice> }
declare class MarkInvoicePaidHandler implements Handler<MarkInvoicePaid, Invoice> { constructor(store: InvoiceStore); handle(c: MarkInvoicePaid): Promise<Invoice> }
declare const store: InvoiceStore;
-->
```ts
import { createMediator, HandlerNotRegisteredError } from '@garkpit/mediator';

const mediator = createMediator();

mediator.register(GetInvoice, new GetInvoiceHandler(store));
mediator.register(MarkInvoicePaid, new MarkInvoicePaidHandler(store));

// The result type follows the request class: `invoice` is an Invoice.
const invoice = await mediator.send(new MarkInvoicePaid('inv-204', new Date()), { actor: 'omar' });
console.log(invoice.paid);

// The app can list what it is able to do.
console.log(mediator.registeredRequestTypes()); // ['GetInvoice', 'MarkInvoicePaid']
```

What can go wrong, and what you get:

| Situation | Result |
|---|---|
| You `send` a request nobody registered a handler for | `HandlerNotRegisteredError`, with the class name in `requestName` |
| You `register` a second handler for the same class name | `HandlerAlreadyRegisteredError` at start-up, not a silent overwrite |
| The handler throws | The same error reaches the caller, unchanged, after every behavior has seen it |

## The request context: who is asking

The second argument to `send` is the **request context**. It travels to every behavior. It has four
fields:

| Field | What it is for |
|---|---|
| `actor` | Who is making the request: a user id, a service name. Required. `AuditBehavior` records it. |
| `correlationId` | An id you choose (often one per HTTP request) so the audit row can be matched to your logs. |
| `audit` | Extra key/values for this one send's audit row, such as how the request arrived (`{ via: 'assistant-chat' }`). They can add to what the command reports but never overwrite it. |
| `secrets` | Values that must never appear in the audit row, wherever they turn up: a key someone typed into a form, say. Each is replaced with `[REDACTED]`. |

<!-- check:prelude
import { Command, createMediator } from '@garkpit/mediator';
class MarkInvoicePaid extends Command<void> { constructor(readonly id: string, readonly paidOn: Date) { super(); } }
const mediator = createMediator();
-->
```ts
await mediator.send(new MarkInvoicePaid('inv-204', new Date()), {
  actor: 'omar',
  correlationId: crypto.randomUUID(),
  audit: { via: 'bulk-import', batch: '2026-11' }
});
```

Handlers do not receive the context. If a handler needs to know who is asking (to filter a list to the
caller's own records, say) put that on the request: `new ListInvoices({ ownerId: session.userId })`.
The context is for the pipeline; the request is for the handler.

## Should a Query ever change anything?

No. If reading has a side effect that matters (marking a message as read, counting a download) it is a
Command that happens to return data. Keeping Queries pure is what lets an AI assistant run them
without asking anyone, and lets you cache or retry them without thinking. See
[the agentic interface](agentic-interface.md).

## Where next

- [Behaviors](behaviors.md): locking, auditing and logging for every request.
- [The HTTP envelope](http.md): turning results and errors into JSON responses.
