import type { Next, PipelineBehavior } from '../PipelineBehavior';
import type { Request } from '../Request';
import type { RequestContext } from '../RequestContext';
import { isMutexed } from '../HasMutexKey';
import { MutexHeldError } from '../MutexHeldError';

export class MutexBehavior implements PipelineBehavior {
  private readonly held = new Set<string>();

  async invoke<TRequest extends Request<TResponse>, TResponse>(
    request: TRequest,
    next: Next<TResponse>,
    _ctx?: RequestContext
  ): Promise<TResponse> {
    if (!isMutexed(request)) {
      return next();
    }

    // Normalize single-key vs array-key DTOs to a sorted unique key list.
    // Sorted acquisition order is the canonical deadlock-prevention pattern:
    // every command that needs two keys acquires them in the same order, so
    // the classic "A waits for B; B waits for A" loop is impossible.
    const raw = request.mutexKey();
    const keys = Array.from(new Set(typeof raw === 'string' ? [raw] : raw)).sort();

    // All-or-nothing acquisition: if any key is held, throw before we touch
    // the held Set so we don't half-acquire and have to roll back.
    for (const key of keys) {
      if (this.held.has(key)) {
        throw new MutexHeldError(key);
      }
    }

    for (const key of keys) {
      this.held.add(key);
    }

    try {
      return await next();
    } finally {
      // Release every acquired key on every exit path so failed commands do
      // not strand any of them.
      for (const key of keys) {
        this.held.delete(key);
      }
    }
  }
}
