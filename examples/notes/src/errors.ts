// Typed errors the handlers throw, and the one place that turns any error into the route envelope's
// `{ code, message, details? }`. Routes, the audit log and the agent doors all use `toApiError`.
import { HandlerNotRegisteredError, MutexHeldError } from '@garkpit/mediator';
import { DEFAULT_STATUS_FOR_CODE, RequestBodyLimitError, type ApiErrorShape } from '@garkpit/mediator/http';

export class NotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`${what} ${id} does not exist.`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** The library's default table plus this app's own code. */
export const STATUS_FOR_CODE: Record<string, number> = { ...DEFAULT_STATUS_FOR_CODE, PAYLOAD_TOO_LARGE: 413 };

export function toApiError(error: unknown): ApiErrorShape {
  if (error instanceof ValidationError) {
    return { code: 'VALIDATION_FAILED', message: error.message, ...(error.field ? { details: { field: error.field } } : {}) };
  }
  if (error instanceof NotFoundError) return { code: 'NOT_FOUND', message: error.message };
  if (error instanceof MutexHeldError) {
    return { code: 'MUTEX_HELD', message: 'Someone else is changing this right now. Try again in a moment.', details: { key: error.key } };
  }
  if (error instanceof RequestBodyLimitError) return { code: 'PAYLOAD_TOO_LARGE', message: error.message };
  if (error instanceof HandlerNotRegisteredError) return { code: 'INTERNAL', message: error.message };
  // Anything unexpected: say so without leaking internals to the caller.
  return { code: 'INTERNAL', message: 'Something went wrong.' };
}

/** Reads one string field from untyped input, or throws a ValidationError naming the field. */
export function requireString(input: unknown, field: string, max = 200): string {
  const value = typeof input === 'object' && input !== null ? (input as Record<string, unknown>)[field] : undefined;
  if (typeof value !== 'string' || value.trim() === '') throw new ValidationError(`"${field}" must be a non-empty string.`, field);
  if (value.length > max) throw new ValidationError(`"${field}" must be at most ${max} characters.`, field);
  return value.trim();
}
