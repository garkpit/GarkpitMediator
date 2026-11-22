import { expect, test } from 'bun:test';
import { readBoundedBody, RequestBodyLimitError } from './http';

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request('http://127.0.0.1/api', { method: 'POST', body, headers });

test('a declared content-length over the limit is refused before the body is touched', async () => {
  const request = post('x'.repeat(8), { 'content-length': '9000' });
  const error = await readBoundedBody(request, 16).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RequestBodyLimitError);
  expect((error as RequestBodyLimitError).message).toBe(
    'Request body is 9000 bytes; the limit is 16 bytes.',
  );
  expect((error as RequestBodyLimitError).declared).toBe(9000);
  expect(request.bodyUsed).toBe(false);
  expect(request.body?.locked).toBe(false);
});

test('a stream is cancelled the moment it passes the limit, and the message names the limit', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(10));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request('http://127.0.0.1/api', {
    method: 'POST',
    body: stream,
    // @ts-expect-error Bun accepts a streaming body when duplex is declared.
    duplex: 'half',
  });
  const error = await readBoundedBody(request, 25).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RequestBodyLimitError);
  expect((error as RequestBodyLimitError).message).toBe('Request body exceeds the 25-byte limit.');
  expect((error as RequestBodyLimitError).declared).toBeNull();
  expect(cancelled).toBe(true);
});

test('a body at the limit is returned whole; no body is an empty array, not an error', async () => {
  const text = 'x'.repeat(64);
  expect(new TextDecoder().decode(await readBoundedBody(post(text), 64))).toBe(text);
  expect(await readBoundedBody(post(null), 64)).toEqual(new Uint8Array(0));
  expect(await readBoundedBody(new Request('http://127.0.0.1/api'), 64)).toEqual(new Uint8Array(0));
});
