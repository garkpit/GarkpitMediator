import type { PipelineBehavior, Next } from '../PipelineBehavior';
import type { Request } from '../Request';
import type { RequestContext } from '../RequestContext';

/** Receives one line per request; `error` is set when the request failed. Defaults to `console.log`. */
export type MediatorLogSink = (line: string, error?: unknown) => void;

const consoleSink: MediatorLogSink = (line, error) => {
  if (error === undefined) console.log(line);
  else console.log(line, error);
};

/** Logs every request's name, outcome and duration; the failure is rethrown unchanged. */
export class LoggingBehavior implements PipelineBehavior {
  constructor(private readonly sink: MediatorLogSink = consoleSink) {}

  async invoke<TRequest extends Request<TResponse>, TResponse>(
    request: TRequest,
    next: Next<TResponse>,
    _ctx?: RequestContext
  ): Promise<TResponse> {
    const name = request.constructor.name;
    const t0 = performance.now();
    try {
      const result = await next();
      this.sink(`[mediator] ${name} ok (${(performance.now() - t0).toFixed(1)}ms)`);
      return result;
    } catch (e) {
      this.sink(`[mediator] ${name} FAIL (${(performance.now() - t0).toFixed(1)}ms):`, e);
      throw e;
    }
  }
}
