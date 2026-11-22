// The two-shape route envelope: `{ ok: true, data }` or `{ ok: false, error: { code, message, details? } }`,
// always JSON with an explicit content-length.

function json(data: unknown, init?: ResponseInit): Response {
  const body = JSON.stringify(data);
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type"))
    headers.set("content-type", "application/json");
  if (!headers.has("content-length"))
    headers.set(
      "content-length",
      String(new TextEncoder().encode(body).byteLength),
    );
  return new Response(body, { ...init, headers });
}

export interface OkInit {
  headers?: Record<string, string>;
  // Optional non-200 success status (e.g. 202 Accepted for a fire-and-forget op). Defaults to 200.
  status?: number;
}

export function ok<T>(data: T, init?: OkInit) {
  return json({ ok: true, data }, init);
}

export interface ApiErrorShape<Code extends string = string> {
  code: Code;
  message: string;
  details?: unknown;
}

/**
 * Default HTTP status for the shared error codes. Consumers extend it with their own domain codes
 * and pass the extended table to `statusForCode` / `fail`.
 */
export const DEFAULT_STATUS_FOR_CODE: Record<string, number> = {
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  MUTEX_HELD: 409,
  UNAUTHORIZED: 401,
  PRECONDITION_FAILED: 412,
  UPSTREAM_FAILED: 502,
  INTERNAL: 500,
};

/** The one status resolver, so no route keeps its own switch. Unknown codes resolve to 500. */
export function statusForCode(
  code: string,
  table: Record<string, number> = DEFAULT_STATUS_FOR_CODE,
): number {
  return table[code] ?? 500;
}

export function fail<Code extends string = string>(
  error: ApiErrorShape<Code>,
  init?: { statusOverride?: number; table?: Record<string, number> },
) {
  const status = init?.statusOverride ?? statusForCode(error.code, init?.table);
  return json({ ok: false, error }, { status });
}

/** The request body is larger than the limit given to `readBoundedBody`. */
export class RequestBodyLimitError extends Error {
  constructor(
    readonly limit: number,
    /** The content-length the client declared, when that is what tripped the limit. */
    readonly declared: number | null,
  ) {
    super(
      declared === null
        ? `Request body exceeds the ${limit}-byte limit.`
        : `Request body is ${declared} bytes; the limit is ${limit} bytes.`,
    );
    this.name = "RequestBodyLimitError";
  }
}

/**
 * Reads a request body into memory, refusing anything over `limit` bytes. A declared
 * content-length above the limit is refused before a byte is read; a stream is cancelled the
 * moment it passes the limit. A request without a body yields an empty array. Every transport
 * adapter reads bodies through this one function, so there is one limit implementation to test.
 */
export async function readBoundedBody(
  request: Request,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const header = request.headers.get("content-length");
  const declared = header === null ? null : Number(header);
  if (declared !== null && declared > limit) throw new RequestBodyLimitError(limit, declared);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new RequestBodyLimitError(limit, null);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
