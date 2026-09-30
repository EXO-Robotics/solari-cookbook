import { afterEach, describe, expect, it, vi } from 'vitest';
import { SandboxClient } from '@solarisdk/sandbox';
import {
  SolariInspector,
  solariProvider,
  solariConfigFromEnv,
  waitForInventoryAbsence,
  reconcileSolariSandbox,
  type SolariProvider,
} from '../src/server/isolation/solari.ts';
import { IsolationError, type InspectionVm } from '../src/server/isolation/provider.ts';
import { registeredFixture } from '../src/server/isolation/policy.ts';
const config = {
  apiKey: 'test-secret-not-guest',
  fixture: registeredFixture('https://fixture.example/acme-login.html', ['https://id.example']),
};
const rawId = 'signed.private.capability';
function payload() {
  return {
    observation: {
      finalUrl: config.fixture.url,
      title: 'Acme Login',
      text: 'Acme Login',
      claimedService: 'ACME',
      passwordField: true,
      formAction: 'https://outside.example/no-submit',
      formDestinationOrigin: 'https://outside.example',
      redirects: [],
      observedAt: new Date().toISOString(),
    },
    pngBase64:
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3f8AAAAASUVORK5CYII=',
  };
}
function fake(overrides: Partial<InspectionVm> = {}) {
  const events: string[] = [],
    files: { path: string; content: string }[] = [];
  const provider: SolariProvider = {
    async create() {
      events.push('create');
      return {
        id: rawId,
        async writeFiles(input) {
          events.push('write');
          files.push(...input);
        },
        async runWorker() {
          events.push('run');
          return 0;
        },
        async readResult() {
          return Buffer.from(
            JSON.stringify({
              ...payload(),
              inspectionNonce: JSON.parse(
                files.find((file) => file.path.endsWith('request.json'))!.content,
              ).inspectionNonce,
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
  return { provider, events, files };
}
describe('Solari inspector lifecycle', () => {
  it('uses fresh sandbox, validates evidence, redacts signed identity, and confirms cleanup', async () => {
    const f = fake(),
      inspector = new SolariInspector(config, f.provider);
    const result = await inspector.inspect('acme-login');
    expect(result.execution).toBe('SUCCEEDED');
    expect(result.source).toBe('SOLARI_SANDBOX');
    expect(result.cleanup.state).toBe('CONFIRMED');
    expect(result.sandboxId).toMatch(/^solari-[a-f0-9]{32}$/);
    expect(JSON.stringify(result)).not.toContain(rawId);
    expect(JSON.stringify(f.files)).not.toContain(config.apiKey);
    expect(f.events).toEqual(['create', 'write', 'run', 'stop', 'delete']);
    expect(inspector.outstandingCleanups()).toEqual([]);
    await inspector.inspect('acme-login');
    expect(f.events.filter((x) => x === 'create')).toHaveLength(2);
  });
  it('captures measurement order without exposing capabilities or breaking cleanup on observer errors', async () => {
    const events: string[] = [];
    const f = fake();
    const result = await new SolariInspector(config, f.provider, (event) => {
      events.push(event);
      if (event === 'evidence_received') throw new Error('observer failed');
    }).inspect('acme-login');
    expect(result.execution).toBe('SUCCEEDED');
    expect(result.cleanup.state).toBe('CONFIRMED');
    expect(events).toEqual([
      'inspection_started',
      'provision_started',
      'provision_complete',
      'setup_started',
      'setup_complete',
      'collection_started',
      'evidence_received',
      'evidence_validated',
      'cleanup_started',
      'cleanup_complete',
      'inspection_returned',
    ]);
    expect(JSON.stringify(events)).not.toContain(rawId);
    const request = f.files.find((file) => file.path.endsWith('request.json'))!;
    expect(JSON.parse(request.content).benchmarkTiming).toBe(true);
  });
  it('rejects impossible guest timing and still confirms cleanup', async () => {
    const f = fake({
      async readResult() {
        return Buffer.from(
          JSON.stringify({
            ...payload(),
            benchmarkTiming: {
              startedAt: new Date().toISOString(),
              events: {
                workerStarted: 0,
                browserReady: 100,
                navigationStarted: 200,
                pageLoaded: 150,
                factsCollected: 300,
                screenshotCollected: 400,
              },
            },
          }),
        );
      },
    });
    const result = await new SolariInspector(config, f.provider).inspect('acme-login');
    expect(result.execution).toBe('UNAVAILABLE');
    expect(result.failure).toBe('INVALID_EVIDENCE');
    expect(result.cleanup.state).toBe('CONFIRMED');
  });
  it('denies arbitrary targets and missing credentials without creation', async () => {
    const f = fake();
    expect(
      (await new SolariInspector(config, f.provider).inspect('https://evil.example')).failure,
    ).toBe('NAVIGATION_DENIED');
    expect((await new SolariInspector(null, f.provider).inspect('acme-login')).failure).toBe(
      'NOT_CONFIGURED',
    );
    expect(f.events).toEqual([]);
  });
  it('holds capacity after ambiguous create and distinguishes definite refusal', async () => {
    const ambiguous = new SolariInspector(config, {
      async create() {
        throw new Error('network');
      },
    });
    expect((await ambiguous.inspect('acme-login')).cleanup.state).toBe('UNRESOLVED');
    expect((await ambiguous.inspect('acme-login')).failure).toBe('CAPACITY');
    const rejected = new SolariInspector(config, {
      async create() {
        throw new IsolationError('CAPACITY', true);
      },
    });
    expect((await rejected.inspect('acme-login')).cleanup.state).toBe('NOT_CREATED');
    expect(rejected.outstandingCleanups()).toEqual([]);
  });
  it('does not turn deletion acknowledgement into confirmed cleanup when stop is unproven', async () => {
    const inspector = new SolariInspector(
      config,
      fake({
        async stop() {
          return { status: 'releasing' };
        },
      }).provider,
    );
    expect((await inspector.inspect('acme-login')).cleanup.state).toBe('UNRESOLVED');
    expect((await inspector.inspect('acme-login')).failure).toBe('CAPACITY');
  });
  it.each(['bad-json', 'wrong-url', 'stale', 'bad-png'])(
    'rejects %s while still cleaning up',
    async (kind) => {
      const f = fake({
        async readResult() {
          if (kind === 'bad-json') return Buffer.from('{}');
          const p = payload();
          if (kind === 'wrong-url') p.observation.finalUrl = 'https://outside.example/login';
          if (kind === 'stale') p.observation.observedAt = '2000-01-01T00:00:00.000Z';
          if (kind === 'bad-png') p.pngBase64 = Buffer.from('not png').toString('base64');
          return Buffer.from(JSON.stringify(p));
        },
      });
      const result = await new SolariInspector(config, f.provider).inspect('acme-login');
      expect(result.failure).toBe('INVALID_EVIDENCE');
      expect(result.observation).toBeNull();
      expect(result.cleanup.state).toBe('CONFIRMED');
    },
  );
  it('loads an exact admin-owned target and refuses a credential-exfiltration API endpoint', () => {
    const env = {
      SOLARI_API_KEY: 'test',
      AIONGUARD_FIXTURE_URL: config.fixture.url,
      AIONGUARD_IDP_ORIGINS: 'https://id.example',
    };
    expect(solariConfigFromEnv(env)?.fixture.url).toBe(config.fixture.url);
    expect(solariConfigFromEnv({ ...env, SOLARI_BASE_URL: 'https://evil.example' })).toBeNull();
    expect(solariConfigFromEnv({ ...env, AIONGUARD_MAX_CONCURRENT_SANDBOXES: '2' })).toBeNull();
    expect(
      solariConfigFromEnv({ ...env, AIONGUARD_FIXTURE_ORIGIN: 'https://other.example' }),
    ).toBeNull();
  });
});

describe('Solari inventory convergence', () => {
  it('waits for delayed removal without accepting a nonempty or paginated inventory', async () => {
    const states = [{ sandboxes: [{}] }, { sandboxes: [], nextCursor: 'more' }, { sandboxes: [] }];
    let calls = 0;
    const absent = await waitForInventoryAbsence(
      async () => states[calls++]!,
      new AbortController().signal,
      async () => {},
    );
    expect(absent).toBe(true);
    expect(calls).toBe(3);
  });
  it('keeps unresolved resources bounded and obeys cancellation', async () => {
    let calls = 0;
    expect(
      await waitForInventoryAbsence(
        async () => {
          calls++;
          return { sandboxes: [{}] };
        },
        new AbortController().signal,
        async () => {},
      ),
    ).toBe(false);
    expect(calls).toBe(10);
    const controller = new AbortController();
    controller.abort();
    await expect(
      waitForInventoryAbsence(async () => ({ sandboxes: [] }), controller.signal),
    ).rejects.toThrow();
  });
});

describe('complete Solari reconciliation', () => {
  function client(
    list: () => Promise<any>,
    get = async (): Promise<any> => {
      throw { status: 404 };
    },
  ) {
    return { kill: async () => undefined, list, get } as Parameters<
      typeof reconcileSolariSandbox
    >[0];
  }
  const signal = () => AbortSignal.timeout(10000);
  it('requires ten complete empty inventories and not-found point lookups', async () => {
    let calls = 0;
    expect(
      await reconcileSolariSandbox(
        client(async () => {
          calls++;
          return { sandboxes: [] };
        }),
        'owned',
        'tag',
        signal(),
        async () => {},
      ),
    ).toBe(true);
    expect(calls).toBe(10);
  });
  it('does not ignore later inventory pages or fluctuating presence', async () => {
    let calls = 0;
    const c = client(async () => {
      calls++;
      return calls % 2
        ? { sandboxes: [], nextCursor: 'page2' }
        : { sandboxes: [{ sandboxId: 'owned' }] };
    });
    expect(await reconcileSolariSandbox(c, 'owned', 'tag', signal(), async () => {})).toBe(false);
    expect(calls).toBe(40);
  });
  it('rejects list and point-get disagreement and ambiguous errors', async () => {
    expect(
      await reconcileSolariSandbox(
        client(
          async () => ({ sandboxes: [] }),
          async () => ({ state: 'running' }),
        ),
        'owned',
        'tag',
        signal(),
        async () => {},
      ),
    ).toBe(false);
    expect(
      await reconcileSolariSandbox(
        client(
          async () => ({ sandboxes: [] }),
          async () => {
            throw { status: 503 };
          },
        ),
        'owned',
        'tag',
        signal(),
        async () => {},
      ),
    ).toBe(false);
  });
  it('fails closed on incomplete pagination', async () => {
    expect(
      await reconcileSolariSandbox(
        client(async () => ({ sandboxes: [], nextCursor: 'repeated' })),
        'owned',
        'tag',
        signal(),
        async () => {},
      ),
    ).toBe(false);
  });
});

describe('Solari signed-capability stop reconciliation', () => {
  afterEach(() => vi.restoreAllMocks());
  async function providerVm(kill: () => Promise<void>) {
    vi.spyOn(SandboxClient.prototype, 'create').mockResolvedValue({ id: rawId, kill } as Awaited<
      ReturnType<SandboxClient['create']>
    >);
    vi.spyOn(SandboxClient.prototype, 'kill').mockRejectedValue({ status: 404 });
    const loaded = solariConfigFromEnv({
      SOLARI_API_KEY: 'test',
      AIONGUARD_FIXTURE_URL: config.fixture.url,
      AIONGUARD_IDP_ORIGINS: 'https://id.example',
    })!;
    return solariProvider.create(
      { name: 'owned-stop-test', config: loaded },
      AbortSignal.timeout(5000),
    );
  }
  it('confirms stop after signed kill fails only when complete inventories and point lookups prove absence', async () => {
    const list = vi.spyOn(SandboxClient.prototype, 'list').mockResolvedValue({ sandboxes: [] });
    const get = vi.spyOn(SandboxClient.prototype, 'get').mockRejectedValue({ status: 404 });
    const vm = await providerVm(async () => {
      throw new Error('expired capability');
    });
    expect(await vm.stop(AbortSignal.timeout(5000))).toEqual({ status: 'stopped' });
    expect(list).toHaveBeenCalledTimes(10);
    expect(get).toHaveBeenCalledTimes(10);
    await vm.delete(AbortSignal.timeout(5000));
    expect(list).toHaveBeenCalledTimes(10);
  });
  it('does not convert failed kill and ambiguous lookup into confirmed stop', async () => {
    vi.spyOn(SandboxClient.prototype, 'list').mockResolvedValue({ sandboxes: [] });
    vi.spyOn(SandboxClient.prototype, 'get').mockRejectedValue({ status: 503 });
    const vm = await providerVm(async () => {
      throw new Error('kill unavailable');
    });
    expect(await vm.stop(AbortSignal.timeout(5000))).toEqual({ status: 'unknown' });
  });
  it('does not reconcile after the stop signal aborts', async () => {
    const list = vi.spyOn(SandboxClient.prototype, 'list').mockResolvedValue({ sandboxes: [] });
    const controller = new AbortController();
    const vm = await providerVm(async () => {
      await Promise.resolve();
      controller.abort();
      throw new Error('cancelled');
    });
    await expect(vm.stop(controller.signal)).rejects.toThrow();
    expect(list).not.toHaveBeenCalled();
  });
});
