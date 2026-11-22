import type { Request } from './Request';

export interface Handler<TRequest extends Request<TResponse>, TResponse> {
  handle(request: TRequest): Promise<TResponse>;
}

export type RequestConstructor<T extends Request<unknown>> = new (
  ...args: never[]
) => T;
