import { describe, expect, test } from 'bun:test';
import {
  BehaviorAlreadyRegisteredError,
  Command,
  createMediator,
  HandlerAlreadyRegisteredError,
  HandlerNotRegisteredError,
  Mediator,
  Query,
  type MediatorPort,
  type Next,
  type PipelineBehavior,
  type Request,
  type RequestContext
} from './index';

class GetGreeting extends Query<string> {
  constructor(readonly name: string) { super(); }
}
class RenameNote extends Command<{ id: string; title: string }> {
  constructor(readonly id: string, readonly title: string) { super(); }
}

/** A behavior that records when it runs, so tests can read the pipeline order. */
function tracer(label: string, trace: string[]): PipelineBehavior {
  const behavior = {
    async invoke<TRequest extends Request<TResponse>, TResponse>(_request: TRequest, next: Next<TResponse>): Promise<TResponse> {
      trace.push(`${label}:before`);
      try { return await next(); } finally { trace.push(`${label}:after`); }
    }
  };
  // Behaviors are keyed by constructor name, so each tracer needs its own class.
  const Named = { [label]: class {} }[label]!;
  Object.setPrototypeOf(behavior, Named.prototype);
  return behavior as PipelineBehavior;
}

describe('dispatch', () => {
  test('send routes a request to the handler registered for its class and returns its result', async () => {
    const mediator = new Mediator();
    mediator.register(GetGreeting, { handle: async (q) => `hello ${q.name}` });
    mediator.register(RenameNote, { handle: async (c) => ({ id: c.id, title: c.title }) });
    expect(await mediator.send(new GetGreeting('jay'))).toBe('hello jay');
    expect(await mediator.send(new RenameNote('n1', 'New'))).toEqual({ id: 'n1', title: 'New' });
  });

  test('an unregistered request fails with HandlerNotRegisteredError naming the class', async () => {
    const error = await new Mediator().send(new GetGreeting('x')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HandlerNotRegisteredError);
    expect((error as HandlerNotRegisteredError).requestName).toBe('GetGreeting');
    expect((error as Error).message).toBe('No mediator handler registered for GetGreeting');
  });

  test('a second handler for the same class throws unless allowReplace is passed', async () => {
    const mediator = new Mediator();
    mediator.register(GetGreeting, { handle: async () => 'first' });
    expect(() => mediator.register(GetGreeting, { handle: async () => 'second' })).toThrow(HandlerAlreadyRegisteredError);
    mediator.register(GetGreeting, { handle: async () => 'replaced' }, { allowReplace: true });
    expect(await mediator.send(new GetGreeting('x'))).toBe('replaced');
  });

  test('handlers are keyed by class name, so a redefined class of the same name (HMR) reaches the handler', async () => {
    const mediator = new Mediator();
    mediator.register(GetGreeting, { handle: async (q) => `hi ${q.name}` });
    const reload = () => {
      class GetGreeting extends Query<string> { constructor(readonly name: string) { super(); } }
      return GetGreeting;
    };
    const Reloaded = reload();
    expect(Reloaded).not.toBe(GetGreeting);
    expect(await mediator.send(new Reloaded('again'))).toBe('hi again');
  });

  test('registeredRequestTypes lists every registered class name, sorted, as a fresh array', () => {
    const mediator = new Mediator();
    mediator.register(RenameNote, { handle: async (c) => ({ id: c.id, title: c.title }) });
    mediator.register(GetGreeting, { handle: async () => '' });
    const listed = mediator.registeredRequestTypes();
    expect(listed).toEqual(['GetGreeting', 'RenameNote']);
    (listed as string[]).push('Tampered');
    expect(mediator.registeredRequestTypes()).toEqual(['GetGreeting', 'RenameNote']);
  });

  test('a handler error reaches the caller unchanged', async () => {
    const mediator = new Mediator();
    const boom = new Error('handler failed');
    mediator.register(GetGreeting, { handle: async (): Promise<string> => { throw boom; } });
    expect(await mediator.send(new GetGreeting('x')).catch((e: unknown) => e)).toBe(boom);
  });
});

describe('pipeline', () => {
  test('behaviors wrap the handler in registration order, outermost first', async () => {
    const trace: string[] = [];
    const mediator = createMediator({ behaviors: [tracer('Outer', trace), tracer('Inner', trace)] });
    mediator.register(GetGreeting, { handle: async () => { trace.push('handler'); return 'done'; } });
    expect(await mediator.send(new GetGreeting('x'))).toBe('done');
    expect(trace).toEqual(['Outer:before', 'Inner:before', 'handler', 'Inner:after', 'Outer:after']);
  });

  test('every behavior receives the same request and the RequestContext given to send', async () => {
    const seen: Array<{ request: unknown; ctx: RequestContext | undefined }> = [];
    class Recorder implements PipelineBehavior {
      async invoke<TRequest extends Request<TResponse>, TResponse>(request: TRequest, next: Next<TResponse>, ctx?: RequestContext) {
        seen.push({ request, ctx });
        return next();
      }
    }
    const mediator = createMediator({ behaviors: [new Recorder()] });
    mediator.register(GetGreeting, { handle: async () => 'ok' });
    const request = new GetGreeting('x');
    const ctx: RequestContext = { actor: 'alice', correlationId: 'c-1', audit: { via: 'chat' } };
    await mediator.send(request, ctx);
    await mediator.send(request);
    expect(seen).toEqual([{ request, ctx }, { request, ctx: undefined }]);
  });

  test('a behavior can short-circuit: the handler never runs', async () => {
    let ran = false;
    class Deny implements PipelineBehavior {
      async invoke<TRequest extends Request<TResponse>, TResponse>(): Promise<TResponse> { throw new Error('denied'); }
    }
    const mediator = createMediator({ behaviors: [new Deny()] });
    mediator.register(GetGreeting, { handle: async () => { ran = true; return 'x'; } });
    await expect(mediator.send(new GetGreeting('x'))).rejects.toThrow('denied');
    expect(ran).toBe(false);
  });

  test('a behavior class is used once; allowReplace swaps it in place, keeping the order', async () => {
    const trace: string[] = [];
    const mediator = new Mediator();
    const first = tracer('First', trace);
    mediator.use(first);
    mediator.use(tracer('Second', trace));
    expect(() => mediator.use(tracer('First', trace))).toThrow(BehaviorAlreadyRegisteredError);
    const replacement = tracer('First', []);
    const replaced: string[] = [];
    Object.assign(replacement, {
      async invoke<TRequest extends Request<TResponse>, TResponse>(_r: TRequest, next: Next<TResponse>) {
        replaced.push('replacement'); trace.push('First(replacement):before'); return next();
      }
    });
    mediator.use(replacement, { allowReplace: true });
    mediator.register(GetGreeting, { handle: async () => 'ok' });
    await mediator.send(new GetGreeting('x'));
    expect(trace).toEqual(['First(replacement):before', 'Second:before', 'Second:after']);
    expect(replaced).toEqual(['replacement']);
  });

  test('createMediator wires exactly the behaviors given and nothing else', async () => {
    const mediator = createMediator();
    mediator.register(GetGreeting, { handle: async (q) => q.name });
    expect(await mediator.send(new GetGreeting('bare'))).toBe('bare');
  });
});

describe('MediatorPort', () => {
  test('Mediator satisfies the structural port, and so does a plain object of the same shape', async () => {
    const port: MediatorPort = new Mediator();
    port.register(GetGreeting, { handle: async () => 'via port' });
    expect(port.registeredRequestTypes()).toEqual(['GetGreeting']);
    expect(await port.send(new GetGreeting('x'))).toBe('via port');

    const handlers = new Map<string, { handle(r: never): Promise<unknown> }>();
    const foreign: MediatorPort = {
      register: (ctor, handler) => { handlers.set(ctor.name, handler as never); },
      registeredRequestTypes: () => [...handlers.keys()].sort(),
      send: async (request) => (handlers.get(request.constructor.name)!.handle as (r: unknown) => Promise<never>)(request)
    };
    foreign.register(GetGreeting, { handle: async (q) => `foreign ${q.name}` });
    expect(await foreign.send(new GetGreeting('jay'))).toBe('foreign jay');
  });
});
