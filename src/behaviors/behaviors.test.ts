import { describe, expect, test } from 'bun:test';
import {
  AuditBehavior,
  auditEntryToLogEntry,
  Command,
  createMediator,
  LoggingBehavior,
  MutexBehavior,
  MutexHeldError,
  Query,
  type AuditEntry,
  type AuditInfo,
  type HasAuditInfo,
  type HasMutexKey,
  type LogEntry
} from '../index';

class Lock extends Command<string> implements HasMutexKey {
  constructor(readonly keys: string | readonly string[], readonly gate: Promise<void>) { super(); }
  mutexKey() { return this.keys; }
}

/** A Lock handler that waits on the request's gate, so a test controls when the lock is released. */
function lockingMediator(failOn?: string) {
  const mediator = createMediator({ behaviors: [new MutexBehavior()] });
  mediator.register(Lock, {
    handle: async (request) => {
      await request.gate;
      if (failOn !== undefined && request.keys === failOn) throw new Error('handler failed');
      return 'released';
    }
  });
  return mediator;
}

describe('MutexBehavior', () => {
  test('a second command on a held key fails with MutexHeldError; the first completes', async () => {
    const mediator = lockingMediator();
    let open!: () => void;
    const first = mediator.send(new Lock('note:1', new Promise<void>((r) => { open = r; })));
    const second = await mediator.send(new Lock('note:1', Promise.resolve())).catch((e: unknown) => e);
    expect(second).toBeInstanceOf(MutexHeldError);
    expect((second as MutexHeldError).key).toBe('note:1');
    open();
    expect(await first).toBe('released');
    expect(await mediator.send(new Lock('note:1', Promise.resolve()))).toBe('released');
  });

  test('different keys run concurrently', async () => {
    const mediator = lockingMediator();
    let open!: () => void;
    const held = mediator.send(new Lock('a', new Promise<void>((r) => { open = r; })));
    expect(await mediator.send(new Lock('b', Promise.resolve()))).toBe('released');
    open();
    await held;
  });

  test('multi-key acquisition is all-or-nothing: one held key blocks the set and strands none', async () => {
    const mediator = lockingMediator();
    let open!: () => void;
    const held = mediator.send(new Lock('b', new Promise<void>((r) => { open = r; })));
    expect(await mediator.send(new Lock(['a', 'b'], Promise.resolve())).catch((e: unknown) => e)).toBeInstanceOf(MutexHeldError);
    // 'a' was not left half-acquired by the refused set.
    expect(await mediator.send(new Lock('a', Promise.resolve()))).toBe('released');
    open();
    await held;
    expect(await mediator.send(new Lock(['b', 'a', 'b'], Promise.resolve()))).toBe('released');
  });

  test('keys are released when the handler throws', async () => {
    const mediator = lockingMediator('k');
    expect(await mediator.send(new Lock('k', Promise.resolve())).catch((e: unknown) => (e as Error).message)).toBe('handler failed');
    // Not MutexHeldError: the failed command released its key.
    expect(await mediator.send(new Lock('k', Promise.resolve())).catch((e: unknown) => (e as Error).message)).toBe('handler failed');
    expect(await mediator.send(new Lock('other', Promise.resolve()))).toBe('released');
  });

  test('requests without mutexKey pass straight through', async () => {
    class Plain extends Query<number> {}
    const mediator = createMediator({ behaviors: [new MutexBehavior()] });
    mediator.register(Plain, { handle: async () => 7 });
    expect(await mediator.send(new Plain())).toBe(7);
  });
});

interface TenantAuditInfo extends AuditInfo { tenant: string | null }

class SaveNote extends Command<string> implements HasAuditInfo<TenantAuditInfo> {
  constructor(readonly title: string, readonly outcome: 'ok' | 'throw' | 'noop' = 'ok') { super(); }
  auditInfo(): TenantAuditInfo {
    return {
      action: 'note.save',
      tenant: 'acme',
      resourceId: 'note-1',
      details: this.outcome === 'noop' ? { columnsPatched: [] } : { title: this.title, apiToken: 'sk-live-123', nested: { password: 'p' } }
    };
  }
}

function auditRig(options: { failWrite?: boolean; mirror?: boolean } = {}) {
  const rows: Array<{ entry: AuditEntry; info: TenantAuditInfo }> = [];
  const logs: Array<{ entry: LogEntry; info: TenantAuditInfo }> = [];
  const failures: string[] = [];
  const behavior = new AuditBehavior<TenantAuditInfo>({
    appendEntry: async (entry, info) => { if (options.failWrite) throw new Error('db down'); rows.push({ entry, info }); },
    ...(options.mirror ? { appendLogEntry: async (entry: LogEntry, info: TenantAuditInfo) => { logs.push({ entry, info }); }, logSource: 'web' } : {}),
    mapError: (error) => ({ code: error instanceof Error && error.message === 'conflict' ? 'CONFLICT' : 'INTERNAL' }),
    reportFailure: (message) => { failures.push(message); }
  });
  const mediator = createMediator({ behaviors: [behavior] });
  mediator.register(SaveNote, {
    handle: async (c) => {
      if (c.outcome === 'throw') throw new Error('conflict');
      return `saved ${c.title}`;
    }
  });
  return { mediator, rows, logs, failures };
}

describe('AuditBehavior', () => {
  test('a successful command writes one redacted ok row; the writer receives the app’s own audit info', async () => {
    const { mediator, rows } = auditRig();
    expect(await mediator.send(new SaveNote('Hello'), { actor: 'alice', correlationId: 'c-9' })).toBe('saved Hello');
    expect(rows).toHaveLength(1);
    const { entry, info } = rows[0]!;
    expect(entry).toMatchObject({
      schemaVersion: 2, actor: 'alice', action: 'note.save', outcome: 'ok', commandName: 'SaveNote',
      correlationId: 'c-9', resourceId: 'note-1',
      details: { title: 'Hello', apiToken: '[REDACTED]', nested: { password: '[REDACTED]' } }
    });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(entry.timestamp))).toBe(false);
    expect(typeof entry.durationMs).toBe('number');
    expect('instance' in entry).toBe(false);
    expect(info.tenant).toBe('acme');
  });

  test('a failing command writes a fail row with the mapped code, then rethrows the original error', async () => {
    const { mediator, rows } = auditRig();
    const error = await mediator.send(new SaveNote('x', 'throw'), { actor: 'bob' }).catch((e: unknown) => e);
    expect((error as Error).message).toBe('conflict');
    expect(rows.map((r) => r.entry)).toMatchObject([{ outcome: 'fail', actor: 'bob', error: { code: 'CONFLICT', message: 'conflict' } }]);
  });

  test('ctx.audit annotates the details but never overwrites what the command reports', async () => {
    const { mediator, rows } = auditRig();
    await mediator.send(new SaveNote('Mine'), { actor: 'a', audit: { via: 'assistant-chat', proposalId: 'p1', title: 'Spoofed' } });
    expect(rows[0]!.entry.details).toMatchObject({ via: 'assistant-chat', proposalId: 'p1', title: 'Mine' });
  });

  test('ctx.secrets are scrubbed from the details under any key and from the error message', async () => {
    const { mediator, rows } = auditRig();
    await mediator.send(new SaveNote('key sk-quoted-in-the-title'), { actor: 'a', secrets: ['sk-quoted-in-the-title', ''], audit: { echoed: ['sk-quoted-in-the-title'] } });
    expect(JSON.stringify(rows[0]!.entry)).not.toContain('sk-quoted-in-the-title');
    expect(rows[0]!.entry.details).toMatchObject({ title: 'key [REDACTED]', echoed: ['[REDACTED]'] });
    class Leaky extends Command<void> implements HasAuditInfo {
      auditInfo(): AuditInfo { return { action: 'leaky', details: {} }; }
    }
    mediator.register<void, Leaky>(Leaky, { handle: async () => { throw new Error('provider rejected sk-quoted-in-the-title'); } });
    await mediator.send(new Leaky(), { actor: 'a', secrets: ['sk-quoted-in-the-title'] }).catch(() => undefined);
    expect(rows[1]!.entry.error?.message).toBe('provider rejected [REDACTED]');
    // Without ctx.secrets a row is exactly as before.
    await mediator.send(new SaveNote('plain'), { actor: 'a' });
    expect(rows[2]!.entry.details.title).toBe('plain');
  });

  test('a no-op patch (columnsPatched: []) writes no row; the result still returns', async () => {
    const { mediator, rows } = auditRig();
    expect(await mediator.send(new SaveNote('same', 'noop'), { actor: 'a' })).toBe('saved same');
    expect(rows).toEqual([]);
  });

  test('without a context the actor is the generic default, never an app string', async () => {
    const { mediator, rows } = auditRig();
    await mediator.send(new SaveNote('x'));
    expect(rows[0]!.entry.actor).toBe('system');
  });

  test('a failed audit write is reported and does not change the command result', async () => {
    const { mediator, failures } = auditRig({ failWrite: true });
    expect(await mediator.send(new SaveNote('x'), { actor: 'a' })).toBe('saved x');
    expect(failures).toEqual(['[audit] write failed']);
  });

  test('with appendLogEntry and logSource each row is mirrored into the generic log', async () => {
    const { mediator, rows, logs } = auditRig({ mirror: true });
    await mediator.send(new SaveNote('x', 'throw'), { actor: 'a' }).catch(() => undefined);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.entry).toEqual(auditEntryToLogEntry(rows[0]!.entry, 'web'));
    expect(logs[0]!.entry).toMatchObject({ source: 'web', level: 'warn', eventType: 'audit', event: 'note.save', outcome: 'fail' });
    expect(logs[0]!.info.tenant).toBe('acme');
  });

  test('requests that are not auditable pass through with no row', async () => {
    class Read extends Query<number> {}
    const rows: AuditEntry[] = [];
    const mediator = createMediator({ behaviors: [new AuditBehavior({ appendEntry: async (e) => { rows.push(e); }, mapError: () => ({ code: 'INTERNAL' }) })] });
    mediator.register(Read, { handle: async () => 1 });
    expect(await mediator.send(new Read(), { actor: 'a' })).toBe(1);
    expect(rows).toEqual([]);
  });
});

describe('LoggingBehavior', () => {
  test('logs one ok line per request, and a FAIL line with the error before rethrowing', async () => {
    class Ping extends Query<string> { constructor(readonly fail = false) { super(); } }
    const lines: Array<{ line: string; error?: unknown }> = [];
    const mediator = createMediator({ behaviors: [new LoggingBehavior((line, error) => { lines.push(error === undefined ? { line } : { line, error }); })] });
    mediator.register(Ping, { handle: async (p) => { if (p.fail) throw new Error('nope'); return 'pong'; } });
    expect(await mediator.send(new Ping())).toBe('pong');
    expect(await mediator.send(new Ping(true)).catch((e: unknown) => (e as Error).message)).toBe('nope');
    expect(lines[0]!.line).toMatch(/^\[mediator\] Ping ok \(\d+\.\dms\)$/);
    expect(lines[1]!.line).toMatch(/^\[mediator\] Ping FAIL \(\d+\.\dms\):$/);
    expect((lines[1]!.error as Error).message).toBe('nope');
  });
});
