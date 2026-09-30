import { WarmPoolStatusSchema } from '../src/contracts/index.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WarmSolariInspector } from '../src/server/isolation/warm-solari.ts';
import { registeredFixture } from '../src/server/isolation/policy.ts';
import { IsolationError, type InspectionVm } from '../src/server/isolation/provider.ts';
import type { SolariProvider } from '../src/server/isolation/solari.ts';
const config = {
  apiKey: 'private-key',
  fixture: registeredFixture('https://fixture.example/test.html', ['https://id.example']),
};
const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3f8AAAAASUVORK5CYII=';
function fixture(overrides: Partial<InspectionVm> = {}) {
  const events: string[] = [],
    files: string[] = [];
  let flagged = false,
    replay = false;
  const provider: SolariProvider = {
    async create() {
      const number = events.filter((e) => e === 'create').length;
      events.push('create');
      let nonce = '';
      return {
        id: `signed-secret-${number}`,
        async writeFiles(input) {
          events.push(input.some((f) => f.path.endsWith('worker.mjs')) ? 'install' : 'request');
          for (const file of input) {
            files.push(file.content);
            if (file.path.endsWith('request.json'))
              nonce = JSON.parse(file.content).inspectionNonce;
          }
        },
        async runWorker() {
          events.push('run');
          return 0;
        },
        async readResult() {
          return Buffer.from(
            JSON.stringify({
              inspectionNonce: replay ? 'old-nonce' : nonce,
              pngBase64,
              observation: {
                finalUrl: config.fixture.url,
                title: 'Test page',
                text: 'Ordinary article',
                claimedService: 'UNKNOWN',
                passwordField: flagged,
                formAction: null,
                formDestinationOrigin: null,
                redirects: [],
                observedAt: new Date().toISOString(),
              },
            }),
          );
        },
        async stop() {
          events.push('stop');
          return { status: 'stopped' };
        },
        async delete() {
          events.push('delete');
        },
        ...overrides,
      };
    },
  };
  return {
    provider,
    events,
    files,
    flag: () => {
      flagged = true;
    },
    replay: () => {
      replay = true;
    },
  };
}
const pools: WarmSolariInspector[] = [];
function pool(
  provider: SolariProvider,
  options?: ConstructorParameters<typeof WarmSolariInspector>[2],
) {
  const p = new WarmSolariInspector(config, provider, options);
  pools.push(p);
  return p;
}
async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
}
afterEach(async () => {
  vi.useRealTimers();
  for (const p of pools.splice(0)) await p.close();
});
describe('warm Solari lifecycle', () => {
  it('prepares without inspecting, reuses a VM with unique request nonces, and keeps secrets out', async () => {
    const f = fixture(),
      p = pool(f.provider);
    await p.prepare();
    expect(f.events).toEqual(['create', 'install']);
    expect(p.status().state).toBe('READY');
    const a = await p.inspect('acme-login'),
      b = await p.inspect('acme-login');
    expect(a.execution).toBe('SUCCEEDED');
    expect(a.cleanup.state).toBe('RETAINED');
    expect(b.sandboxId).toBe(a.sandboxId);
    expect(b.session?.reused).toBe(true);
    expect(b.session?.inspectionCount).toBe(2);
    expect(f.events.filter((e) => e === 'install')).toHaveLength(1);
    const requests = f.files.filter((s) => s.startsWith('{')).map((s) => JSON.parse(s));
    expect(requests[0].inspectionNonce).not.toBe(requests[1].inspectionNonce);
    expect(JSON.stringify([a, b, p.status()])).not.toContain('signed-secret');
    expect(f.files.join('')).not.toContain(config.apiKey);
    await p.close();
    expect(f.events.slice(-2)).toEqual(['stop', 'delete']);
  });
  it('detaches a flagged VM immediately and warms a replacement only after cleanup', async () => {
    let release!: () => void;
    const f = fixture({
        async stop() {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return { status: 'stopped' };
        },
      }),
      p = pool(f.provider);
    await p.prepare();
    f.flag();
    const result = await p.inspect('acme-login');
    expect(result.session?.disposition).toBe('RETIRED');
    expect(result.cleanup.state).toBe('PENDING');
    expect(p.status().sandboxId).toBeNull();
    expect(p.status().state).toBe('RETIRING');
    expect((await p.inspect('acme-login')).failure).toBe('CAPACITY');
    release();
    await settle();
    await p.prepare();
    expect(p.status().sandboxId).not.toBe(result.sandboxId);
    // Override would also block the replacement's shutdown.
    const closing = p.close();
    await settle();
    release();
    await closing;
  });
  it('rejects replayed evidence and retires the contaminated VM', async () => {
    const f = fixture(),
      p = pool(f.provider);
    await p.prepare();
    f.replay();
    const result = await p.inspect('acme-login');
    expect(result.failure).toBe('INVALID_EVIDENCE');
    expect(result.session?.disposition).toBe('RETIRED');
    await settle();
    expect(f.events).toContain('stop');
  });
  it('rejects concurrent clicks without queueing stale work', async () => {
    let release!: () => void;
    const f = fixture({
        async runWorker() {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return 0;
        },
      }),
      p = pool(f.provider);
    await p.prepare();
    const first = p.inspect('acme-login');
    await settle();
    expect((await p.inspect('acme-login')).failure).toBe('CAPACITY');
    release();
    expect((await first).execution).toBe('SUCCEEDED');
  });
  it('closes during preparation without running a page or replacing the VM', async () => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = fixture({
        async writeFiles() {
          entered();
          await blocked;
        },
      }),
      p = pool(f.provider);
    const prep = p.prepare();
    await started;
    expect(p.status().state).toBe('PREPARING');
    expect(p.status().readyAt).toBeNull();
    expect(WarmPoolStatusSchema.safeParse(p.status()).success).toBe(true);
    const closed = p.close();
    release();
    await prep;
    await closed;
    expect(p.status().state).toBe('CLOSED');
    expect(f.events).not.toContain('run');
    expect(f.events.filter((e) => e === 'create')).toHaveLength(1);
  });
  it('evicts idle VMs without unattended replenishment', async () => {
    const f = fixture(),
      p = pool(f.provider, { idleTimeoutMs: 10 });
    await p.prepare();
    await new Promise((resolve) => setTimeout(resolve, 25));
    await settle();
    expect(p.status().state).toBe('EMPTY');
    expect(f.events.filter((e) => e === 'create')).toHaveLength(1);
  });
  it('replaces aged VMs before a command can cross their deadline', async () => {
    let now = Date.now() - 220_000;
    const f = fixture(),
      p = pool(f.provider, { now: () => now });
    await p.prepare();
    const original = p.status().sandboxId;
    now += 220_000;
    const result = await p.inspect('acme-login');
    expect(result.sandboxId).not.toBe(original);
    expect(f.events.filter((e) => e === 'create')).toHaveLength(2);
  });
  it('blocks replacement after ambiguous cleanup even if delete resolves', async () => {
    const f = fixture({
        async stop() {
          return { status: 'unknown' };
        },
      }),
      p = pool(f.provider);
    f.flag();
    await p.inspect('acme-login');
    await settle();
    expect(p.status().state).toBe('BLOCKED');
    expect(p.status().cleanupUnresolved).toBe(1);
    await p.prepare();
    expect(f.events.filter((e) => e === 'create')).toHaveLength(1);
  });
  it('blocks ambiguous creation but permits a retry after definite rejection', async () => {
    let calls = 0;
    const p = pool({
      async create() {
        calls++;
        throw new Error('signed-secret-error');
      },
    });
    await p.prepare();
    await p.prepare();
    expect(calls).toBe(1);
    expect(p.status().lastError).toBe('PROVIDER_UNAVAILABLE');
    const q = pool({
      async create() {
        calls++;
        throw new IsolationError('CAPACITY', true);
      },
    });
    await q.prepare();
    await q.prepare();
    expect(calls).toBe(3);
    expect(q.status().state).toBe('EMPTY');
  });
  it('retires after worker errors and after the maximum inspection count', async () => {
    const f = fixture({
        async runWorker() {
          return 124;
        },
      }),
      p = pool(f.provider);
    expect((await p.inspect('acme-login')).failure).toBe('TIMEOUT');
    await settle();
    expect(f.events).toContain('stop');
    const g = fixture(),
      q = pool(g.provider, { maxInspections: 1 });
    const result = await q.inspect('acme-login');
    expect(result.execution).toBe('SUCCEEDED');
    expect(result.session?.disposition).toBe('RETIRED');
  });
  it('retires when per-inspection request reset fails', async () => {
    let writes = 0;
    const f = fixture({
      async writeFiles() {
        if (++writes > 1) throw new Error('private-reset-error');
      },
    });
    const p = pool(f.provider);
    await p.prepare();
    const result = await p.inspect('acme-login');
    expect(result.failure).toBe('INVALID_EVIDENCE');
    expect(result.session?.disposition).toBe('RETIRED');
    expect(JSON.stringify(result)).not.toContain('private-reset-error');
    await settle();
    expect(f.events).toContain('stop');
  });
  it('waits for an in-flight inspection on shutdown and never replenishes', async () => {
    let release!: () => void;
    const f = fixture({
      async runWorker() {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return 0;
      },
    });
    const p = pool(f.provider);
    await p.prepare();
    const result = p.inspect('acme-login');
    await settle();
    const closed = p.close();
    release();
    expect((await result).session?.disposition).toBe('RETIRED');
    await closed;
    expect(p.status().state).toBe('CLOSED');
    expect(f.events.filter((e) => e === 'create')).toHaveLength(1);
    expect(f.events).toContain('delete');
  });
  it('rejects unknown destinations without provisioning and shares concurrent preparation', async () => {
    const f = fixture(),
      p = pool(f.provider);
    expect((await p.inspect('other-fixture')).failure).toBe('NAVIGATION_DENIED');
    expect(f.events).toEqual([]);
    const a = p.prepare(),
      b = p.prepare();
    expect(a).toBe(b);
    await Promise.all([a, b]);
    expect(f.events.filter((e) => e === 'create')).toHaveLength(1);
  });
});
