import { describe, expect, test } from 'bun:test';
import { DEFAULT_STATUS_FOR_CODE, fail, ok, statusForCode } from './http';
import { redactSecrets } from './redactSecrets';

describe('the route envelope', () => {
  test('ok: 200, JSON content type, exact content-length, {ok:true,data} bytes', async () => {
    const response = ok({ value: '✓', n: 1 });
    const body = '{"ok":true,"data":{"value":"✓","n":1}}';
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('content-length')).toBe(String(new TextEncoder().encode(body).byteLength));
    expect(await response.text()).toBe(body);
  });

  test('ok: a non-200 success status and extra headers are kept; a given content-type wins', async () => {
    const response = ok(null, { status: 202, headers: { 'x-trace': 't', 'content-type': 'application/vnd.app+json' } });
    expect(response.status).toBe(202);
    expect(response.headers.get('x-trace')).toBe('t');
    expect(response.headers.get('content-type')).toBe('application/vnd.app+json');
    expect(await response.text()).toBe('{"ok":true,"data":null}');
  });

  test('fail: status comes from the code, details are kept, {ok:false,error} bytes', async () => {
    const response = fail({ code: 'CONFLICT', message: 'Changed', details: { revision: 2 } });
    expect(response.status).toBe(409);
    expect(await response.text()).toBe('{"ok":false,"error":{"code":"CONFLICT","message":"Changed","details":{"revision":2}}}');
  });

  test('fail: every shared code maps to its status; unknown codes are 500; statusOverride and tables win', () => {
    expect(DEFAULT_STATUS_FOR_CODE).toEqual({
      VALIDATION_FAILED: 400, NOT_FOUND: 404, CONFLICT: 409, MUTEX_HELD: 409, UNAUTHORIZED: 401,
      PRECONDITION_FAILED: 412, UPSTREAM_FAILED: 502, INTERNAL: 500
    });
    for (const [code, status] of Object.entries(DEFAULT_STATUS_FOR_CODE)) expect(fail({ code, message: '' }).status).toBe(status);
    expect(statusForCode('SOMETHING_ELSE')).toBe(500);
    expect(fail({ code: 'NOT_FOUND', message: '' }, { statusOverride: 410 }).status).toBe(410);
    expect(fail({ code: 'RATE_LIMITED', message: '' }, { table: { ...DEFAULT_STATUS_FOR_CODE, RATE_LIMITED: 429 } }).status).toBe(429);
  });
});

describe('redactSecrets', () => {
  test('redacts secret-looking keys at any depth up to four, in objects and arrays, and leaves the rest', () => {
    expect(redactSecrets({
      title: 'x', token: 't', API_KEY: 'k', Authorization: 'Bearer z', list: [{ password: 'p', ok: 1 }, 'plain'],
      nested: { cookie: 'c', deeper: { privateKey: 'pk', name: 'n' } }
    })).toEqual({
      title: 'x', token: '[REDACTED]', API_KEY: '[REDACTED]', Authorization: '[REDACTED]',
      list: [{ password: '[REDACTED]', ok: 1 }, 'plain'],
      nested: { cookie: '[REDACTED]', deeper: { privateKey: '[REDACTED]', name: 'n' } }
    });
  });

  test('does not mutate its input', () => {
    const input = { secret: 's' };
    redactSecrets(input);
    expect(input).toEqual({ secret: 's' });
  });
});
