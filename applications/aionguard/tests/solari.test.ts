import { describe, expect, it } from 'vitest';
import {
  SolariInspector,
  solariConfigFromEnv,
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
          return Buffer.from(JSON.stringify(payload()));
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
