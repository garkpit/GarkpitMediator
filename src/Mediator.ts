import type { Request } from './Request';
import type { Handler, RequestConstructor } from './Handler';
import type { PipelineBehavior, Next } from './PipelineBehavior';
import type { RequestContext } from './RequestContext';

export class HandlerNotRegisteredError extends Error {
  constructor(public readonly requestName: string) {
    super(`No mediator handler registered for ${requestName}`);
    this.name = 'HandlerNotRegisteredError';
  }
}

export class HandlerAlreadyRegisteredError extends Error {
  constructor(public readonly requestName: string) {
    super(`Mediator handler already registered for ${requestName}`);
    this.name = 'HandlerAlreadyRegisteredError';
  }
}

export class BehaviorAlreadyRegisteredError extends Error {
  constructor(public readonly behaviorName: string) {
    super(`Mediator pipeline behavior already registered: ${behaviorName}`);
    this.name = 'BehaviorAlreadyRegisteredError';
  }
}

type AnyHandler = Handler<Request<unknown>, unknown>;

export interface RegisterOptions {
  /**
   * Allow replacing an already-registered handler for the same Request name.
   *
   * Pass `true` ONLY from dev-mode code (typically the host app's dev
   * environment flag). Vite re-evaluates slice index.ts files on hot reload
   * but does NOT recreate the mediator singleton, so a strict `register()`
   * would crash the dev server. In prod every slice passes `false` (the
   * default) and accidental duplicate registrations still throw loudly.
   *
   * Note: Vite's `import.meta.hot.dispose()` does NOT work here because
   * `import.meta.hot` is a client-side API; it is `undefined` in SSR modules.
   */
  allowReplace?: boolean;
}

/**
 * The mediator surface a library needs from a host: register a handler for a request class, list
 * what is registered, and dispatch a request through the pipeline. It is structural, so a library
 * (Aires, a synced product) composes into the host's own mediator, with the host's own behaviors,
 * without importing this package; `Mediator` below is one implementation.
 *
 * Handlers are keyed by request class NAME (see `Mediator`), so a host mediator must key the same
 * way for request classes to match across module instances.
 */
export interface MediatorPort {
  register<TResponse, TRequest extends Request<TResponse>>(
    ctor: RequestConstructor<TRequest>,
    handler: Handler<TRequest, TResponse>,
    options?: RegisterOptions
  ): void;
  registeredRequestTypes(): readonly string[];
  send<TResponse>(request: Request<TResponse>, ctx?: RequestContext): Promise<TResponse>;
}

export class Mediator implements MediatorPort {
  // Keyed on the Request class NAME (string), not constructor identity. Vite
  // SSR HMR replaces module instances, so the same DTO class redefined on
  // reload gets a fresh `Function` reference. A name-keyed map matches the
  // class across reloads, preventing a stale-handler leak in dev.
  private readonly handlers = new Map<string, AnyHandler>();
  private readonly behaviors: PipelineBehavior[] = [];

  register<TResponse, TRequest extends Request<TResponse>>(
    ctor: RequestConstructor<TRequest>,
    handler: Handler<TRequest, TResponse>,
    options: RegisterOptions = {}
  ): void {
    const key = ctor.name;
    if (this.handlers.has(key) && !options.allowReplace) {
      throw new HandlerAlreadyRegisteredError(key);
    }
    this.handlers.set(key, handler as AnyHandler);
  }

  /**
   * Every request class name a handler is registered for, sorted, as a fresh array.
   * Introspection only — it exists so an app can prove that every registered Command and Query
   * has a matching client-facing projection (e.g. an assistant's tool catalogue).
   */
  registeredRequestTypes(): readonly string[] {
    return [...this.handlers.keys()].sort();
  }

  use(behavior: PipelineBehavior, options: RegisterOptions = {}): void {
    const key = behavior.constructor.name;
    const existingIndex = this.behaviors.findIndex(
      (b) => b.constructor.name === key
    );
    if (existingIndex !== -1) {
      if (!options.allowReplace) {
        throw new BehaviorAlreadyRegisteredError(key);
      }
      // In-place replace preserves pipeline order across HMR re-evaluations.
      this.behaviors[existingIndex] = behavior;
      return;
    }
    this.behaviors.push(behavior);
  }

  async send<TResponse>(
    request: Request<TResponse>,
    ctx?: RequestContext
  ): Promise<TResponse> {
    const key = request.constructor.name;
    const handler = this.handlers.get(key);
    if (!handler) throw new HandlerNotRegisteredError(key);

    let next: Next<TResponse> = () =>
      (handler.handle as (r: Request<TResponse>) => Promise<TResponse>)(request);

    for (const behavior of [...this.behaviors].reverse()) {
      const inner = next;
      next = () => behavior.invoke(request, inner, ctx);
    }

    return next();
  }
}
