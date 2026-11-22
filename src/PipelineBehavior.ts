import type { Request } from './Request';
import type { RequestContext } from './RequestContext';

export type Next<TResponse> = () => Promise<TResponse>;

export interface PipelineBehavior {
  invoke<TRequest extends Request<TResponse>, TResponse>(
    request: TRequest,
    next: Next<TResponse>,
    ctx?: RequestContext
  ): Promise<TResponse>;
}
