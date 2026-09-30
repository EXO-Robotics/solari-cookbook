import { describe, expect, it } from 'vitest';
import { createMockInspector, VercelInspector } from '../../src/server/isolation/inspector.ts';
import {
  inspectorConfigFromEnv,
  validateConfig,
  type VercelInspectorConfig,
} from '../../src/server/isolation/config.ts';
import {
  isAllowedNavigation,
  normalizeFixtureTarget,
  registeredFixture,
  validPng,
} from '../../src/server/isolation/policy.ts';
import {
  IsolationError,
  type CreateInspectionVm,
  type InspectionVm,
  type IsolationProvider,
} from '../../src/server/isolation/provider.ts';
import { allowedRequest } from '../../src/server/isolation/worker.mjs';

const config: VercelInspectorConfig = {
  fixture: registeredFixture('https://fixture.example', ['https://id.acme.example']),
  snapshot: {
    schemaVersion: 1,
    snapshotId: 'snap_eventimage',
    sourceRevision: 'a'.repeat(40),
    approvedAt: '2026-09-10T00:00:00.000Z',
    playwrightVersion: '1.58.2',
    clean: true,
    visitedContent: false,
    credentialsIncluded: false,
  },
  credentials: { token: 'test-only-token', teamId: 'team_test', projectId: 'prj_test' },
};
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3f8AAAAASUVORK5CYII=';
function payload() {
  return {
    observation: {
      finalUrl: 'https://fixture.example/acme-login.html',
      title: 'Acme Login',
      text: 'Acme Login',
      claimedService: 'ACME',
      passwordField: true,
      formAction: 'https://outside.example/no-submit',
      formDestinationOrigin: 'https://outside.example',
      redirects: [],
      observedAt: new Date().toISOString(),
    },
    pngBase64: png,
  };
}
function fake(
  options: {
    output?: () => unknown;
    stop?: () => Promise<{ status: string }>;
    remove?: () => Promise<void>;
    exitCode?: number;
    create?: () => Promise<never>;
  } = {},
) {
  const events: string[] = [],
    creates: CreateInspectionVm[] = [],
    files: { path: string; content: string }[] = [];
  let count = 0;
  const provider: IsolationProvider = {
    async create(input) {
      events.push('create');
      creates.push(input);
      if (options.create) return options.create();
      const vm: InspectionVm = {
        id: `sbox_test_${++count}`,
        async writeFiles(writes) {
          events.push('write');
          files.push(...writes);
        },
        async runWorker() {
          events.push('collect');
          return options.exitCode ?? 0;
        },
        async readResult() {
          events.push('read');
          return Buffer.from(JSON.stringify((options.output ?? payload)()));
        },
        async stop() {
          events.push('stop');
          return options.stop ? options.stop() : { status: 'stopped' };
        },
        async delete() {
          events.push('delete');
          await options.remove?.();
        },
      };
      return vm;
    },
  };
  return { provider, events, creates, files };
}

describe('registered inspection admission', () => {
  it('preserves the legacy origin target and registers an exact project URL', () => {
    expect(registeredFixture('https://fixture.example/', ['https://id.example']).url).toBe(
      'https://fixture.example/acme-login.html',
    );
    expect(normalizeFixtureTarget('https://mfrey18.github.io/AionPhish/')).toEqual({
      origin: 'https://mfrey18.github.io',
      url: 'https://mfrey18.github.io/AionPhish/',
      protectionPath: '/AionPhish/',
    });
    const fixture = registeredFixture('https://mfrey18.github.io/AionPhish/', [
      'https://id.example',
    ]);
    expect(validateConfig({ ...config, fixture }).fixture).toEqual(fixture);
    expect(() =>
      validateConfig({
        ...config,
        fixture: { ...fixture, navigationOrigins: ['https://evil.example'] },
      }),
    ).toThrow('Fixture registry mismatch');
    expect(() =>
      validateConfig({ ...config, fixture: { ...fixture, id: 'arbitrary' } as never }),
    ).toThrow('Fixture registry mismatch');
  });
  it.each([
    'https://user:pass@mfrey18.github.io/AionPhish/',
    'https://@mfrey18.github.io/AionPhish/',
    'https://mfrey18.github.io:8443/AionPhish/',
    'https://mfrey18.github.io:443/AionPhish/',
    'https://mfrey18.github.io:0443/AionPhish/',
    'https://mfrey18.github.io/AionPhish/?query=1',
    'https://mfrey18.github.io/AionPhish/?',
    'https://mfrey18.github.io/AionPhish/#fragment',
    'https://mfrey18.github.io/AionPhish/../OtherProject/',
    'https://mfrey18.github.io/./AionPhish/',
    'https://mfrey18.github.io/AionPhish/%2E%2E/OtherProject/',
    'https://mfrey18.github.io/AionPhish%2FOtherProject/',
    'https://mfrey18.github.io/AionPhish/%5cOtherProject/',
    'https://mfrey18.github.io/AionPhish/%252fOtherProject/',
    'https://mfrey18.github.io//AionPhish/',
    'https://mfrey18.github.io/AionPhish\\OtherProject/',
    ' https://mfrey18.github.io/AionPhish/',
    'https://mfrey18.github.io/AionPhish/\n',
    'http://mfrey18.github.io/AionPhish/',
    'https://127.0.0.1/AionPhish/',
  ])('rejects ambiguous or private target %s before provider dispatch', (target) => {
    expect(() => registeredFixture(target, ['https://id.example'])).toThrow();
  });
  it('loads exact URL configuration, retains origin compatibility, and rejects conflicting inputs', () => {
    const env = {
      AIONGUARD_VERCEL_SNAPSHOT_ID: config.snapshot.snapshotId,
      AIONGUARD_IDP_ORIGINS: 'https://id.acme.example',
      VERCEL_OIDC_TOKEN: 'test-only-oidc',
    };
    const read = (target: NodeJS.ProcessEnv) =>
      inspectorConfigFromEnv({ ...env, ...target }, config.snapshot);
    expect(read({ AIONGUARD_FIXTURE_ORIGIN: 'https://fixture.example' })?.fixture).toEqual(
      config.fixture,
    );
    const target = 'https://mfrey18.github.io/AionPhish/';
    expect(read({ AIONGUARD_FIXTURE_URL: target })?.fixture.url).toBe(target);
    expect(
      read({
        AIONGUARD_FIXTURE_URL: target,
        AIONGUARD_FIXTURE_ORIGIN: 'https://MFREY18.github.io/',
      })?.fixture.url,
    ).toBe(target);
    expect(
      read({ AIONGUARD_FIXTURE_URL: target, AIONGUARD_FIXTURE_ORIGIN: 'https://fixture.example' }),
    ).toBeNull();
    expect(read({ AIONGUARD_FIXTURE_ORIGIN: target })).toBeNull();
    expect(read({ AIONGUARD_FIXTURE_URL: target, AIONGUARD_FIXTURE_ORIGIN: target })).toBeNull();
    expect(
      read({
        AIONGUARD_FIXTURE_URL: `${target}?query=1`,
        AIONGUARD_FIXTURE_ORIGIN: 'https://mfrey18.github.io',
      }),
    ).toBeNull();
    expect(read({ AIONGUARD_FIXTURE_URL: 'https://fixture.example/' })).toBeNull();
    expect(read({ AIONGUARD_FIXTURE_URL: 'https://fixture.example' })).toBeNull();
    expect(read({ AIONGUARD_FIXTURE_ORIGIN: 'https://fixture.example:443' })).toBeNull();
    expect(
      read({
        AIONGUARD_FIXTURE_URL: target,
        AIONGUARD_FIXTURE_ORIGIN: 'https://mfrey18.github.io:0443',
      }),
    ).toBeNull();
  });
  it('sends the registered project URL and only its origin to the injected inspection worker', async () => {
    const target = 'https://mfrey18.github.io/AionPhish/';
    const f = fake({
      output: () => ({ ...payload(), observation: { ...payload().observation, finalUrl: target } }),
    });
    const fixture = registeredFixture(target, ['https://id.acme.example']);
    const result = await new VercelInspector({ ...config, fixture }, f.provider).inspect(
      'acme-login',
    );
    expect(result.execution).toBe('SUCCEEDED');
    expect(result.observation?.finalUrl).toBe(target);
    expect(JSON.parse(f.files[1]!.content)).toEqual({
      url: target,
      navigationOrigins: ['https://mfrey18.github.io'],
      requestPath: '/AionPhish/',
      navigationTimeoutMs: 15_000,
    });
    expect(f.creates[0]?.networkPolicy).toMatchObject({
      allow: {
        'mfrey18.github.io': [{ transform: [{ headers: { Host: 'mfrey18.github.io' } }] }],
      },
    });
    expect(result.cleanup.state).toBe('CONFIRMED');
  });
  it('does not dispatch missing configuration or unregistered IDs', async () => {
    const f = fake(),
      inspector = new VercelInspector(null, f.provider);
    expect((await inspector.inspect('acme-login')).failure).toBe('NOT_CONFIGURED');
    const configured = new VercelInspector(config, f.provider);
    expect((await configured.inspect('https://attacker.example')).failure).toBe(
      'NAVIGATION_DENIED',
    );
    expect(f.events).toEqual([]);
  });
  it('requires an approved clean snapshot and bounded configuration', () => {
    expect(inspectorConfigFromEnv({}, config.snapshot)).toBeNull();
    expect(() =>
      validateConfig({
        ...config,
        snapshot: { ...config.snapshot, visitedContent: true } as never,
      }),
    ).toThrow();
    expect(() => validateConfig({ ...config, maxConcurrent: 6 })).toThrow();
    expect(() =>
      validateConfig({ ...config, navigationTimeoutMs: 30_000, commandTimeoutMs: 10_000 }),
    ).toThrow();
    expect(() =>
      registeredFixture('https://user:pass@fixture.example', ['https://id.example']),
    ).toThrow();
    expect(() => registeredFixture('https://127.0.0.1', ['https://id.example'])).toThrow();
  });
  it('uses separate fresh VM identities and applies egress at creation', async () => {
    const f = fake(),
      inspector = new VercelInspector(config, f.provider);
    const first = await inspector.inspect('acme-login'),
      second = await inspector.inspect('acme-login');
    expect(first.execution).toBe('SUCCEEDED');
    expect(second.execution).toBe('SUCCEEDED');
    expect(first.sandboxId).not.toBe(second.sandboxId);
    expect(f.creates[0]?.name).not.toBe(f.creates[1]?.name);
    expect(f.creates[0]?.networkPolicy).toMatchObject({
      allow: { 'fixture.example': [{ transform: [{ headers: { Host: 'fixture.example' } }] }] },
    });
    expect(f.events).toEqual([
      'create',
      'write',
      'collect',
      'read',
      'stop',
      'delete',
      'create',
      'write',
      'collect',
      'read',
      'stop',
      'delete',
    ]);
    expect(first.cleanup.state).toBe('CONFIRMED');
    expect(inspector.outstandingCleanups()).toEqual([]);
    expect(f.files.map((file) => file.content).join('')).not.toContain('test-only-token');
    const request = JSON.parse(f.files[1]!.content);
    expect(request).toEqual({
      url: 'https://fixture.example/acme-login.html',
      navigationOrigins: ['https://fixture.example'],
      requestPath: '/',
      navigationTimeoutMs: 15_000,
    });
  });
  it('keeps ambiguous creation reserved but releases definite rejection', async () => {
    const f = fake({
      create: async () => {
        throw new IsolationError('PROVIDER_UNAVAILABLE');
      },
    });
    const inspector = new VercelInspector(config, f.provider);
    expect((await inspector.inspect('acme-login')).cleanup.state).toBe('UNRESOLVED');
    expect((await inspector.inspect('acme-login')).failure).toBe('CAPACITY');
    expect(f.creates).toHaveLength(1);
    const rejected = fake({
      create: async () => {
        throw new IsolationError('CAPACITY', true);
      },
    });
    const other = new VercelInspector(config, rejected.provider);
    expect((await other.inspect('acme-login')).cleanup.state).toBe('NOT_CREATED');
    expect(other.outstandingCleanups()).toEqual([]);
  });
});

describe('collection failures and cleanup', () => {
  it.each(['finalUrl', 'redirects'] as const)(
    'rejects a sibling project in %s and still cleans up its VM',
    async (field) => {
      const target = 'https://mfrey18.github.io/AionPhish/';
      const sibling = 'https://mfrey18.github.io/OtherProject/';
      const f = fake({
        output: () => ({
          ...payload(),
          observation: {
            ...payload().observation,
            finalUrl: field === 'finalUrl' ? sibling : target,
            redirects: field === 'redirects' ? [sibling] : [],
          },
        }),
      });
      const fixture = registeredFixture(target, ['https://id.acme.example']);
      const result = await new VercelInspector({ ...config, fixture }, f.provider).inspect(
        'acme-login',
      );
      expect(result).toMatchObject({
        execution: 'UNAVAILABLE',
        failure: 'INVALID_EVIDENCE',
        observation: null,
        pngBase64: null,
        cleanup: { state: 'CONFIRMED' },
      });
      expect(f.events.slice(-2)).toEqual(['stop', 'delete']);
    },
  );
  it.each(['NAVIGATION_DENIED', 'TIMEOUT', 'INVALID_EVIDENCE'] as const)(
    'returns %s with no invented page evidence',
    async (failure) => {
      const f = fake({ output: () => ({ failure }) }),
        inspector = new VercelInspector(config, f.provider);
      const result = await inspector.inspect('acme-login');
      expect(result).toMatchObject({
        execution: 'UNAVAILABLE',
        failure,
        observation: null,
        pngBase64: null,
      });
      expect(f.events.slice(-2)).toEqual(['stop', 'delete']);
    },
  );
  it.each([
    'https://fixture.example.evil/acme-login.html',
    'https://user:pass@fixture.example/acme-login.html',
    'https://fixture.example:8443/acme-login.html',
  ])('rejects final URL %s despite successful worker exit', async (finalUrl) => {
    const f = fake({
      output: () => {
        const data = payload();
        data.observation.finalUrl = finalUrl;
        return data;
      },
    });
    expect((await new VercelInspector(config, f.provider).inspect('acme-login')).failure).toBe(
      'INVALID_EVIDENCE',
    );
  });
  it('rejects cross-origin redirect metadata, stale evidence and mismatched form origins', async () => {
    const variants = [
      () => ({
        ...payload(),
        observation: { ...payload().observation, redirects: ['https://evil.example/'] },
      }),
      () => ({
        ...payload(),
        observation: { ...payload().observation, observedAt: '2020-01-01T00:00:00.000Z' },
      }),
      () => ({
        ...payload(),
        observation: { ...payload().observation, formDestinationOrigin: 'https://id.acme.example' },
      }),
      () => ({
        ...payload(),
        observation: {
          ...payload().observation,
          formAction: 'https://user:pass@outside.example/no-submit',
        },
      }),
      () => ({ ...payload(), pngBase64: Buffer.from('<svg onload=alert(1)>').toString('base64') }),
    ];
    for (const output of variants) {
      const result = await new VercelInspector(config, fake({ output }).provider).inspect(
        'acme-login',
      );
      expect(result).toMatchObject({
        execution: 'UNAVAILABLE',
        failure: 'INVALID_EVIDENCE',
        observation: null,
        pngBase64: null,
      });
    }
  });
  it('does not free capacity from delete acknowledgement without terminal stop', async () => {
    const f = fake({ stop: async () => ({ status: 'stopping' }) }),
      inspector = new VercelInspector(config, f.provider);
    const result = await inspector.inspect('acme-login');
    expect(result.cleanup).toMatchObject({ state: 'UNRESOLVED', stoppedAt: null });
    expect(result.cleanup.deletedAt).not.toBeNull();
    expect((await inspector.inspect('acme-login')).failure).toBe('CAPACITY');
  });
  it('always attempts delete when stop fails and retains failed deletion', async () => {
    for (const options of [
      {
        stop: async (): Promise<{ status: string }> => {
          throw new Error('stop unavailable');
        },
      },
      {
        remove: async () => {
          throw new Error('delete unavailable');
        },
      },
    ]) {
      const f = fake(options),
        inspector = new VercelInspector(config, f.provider);
      expect((await inspector.inspect('acme-login')).cleanup.state).toBe('UNRESOLVED');
      expect(f.events.slice(-2)).toEqual(['stop', 'delete']);
      expect(inspector.outstandingCleanups()).toHaveLength(1);
    }
  });
  it('labels software verification MOCK and never invokes a provider', async () => {
    const result = await createMockInspector().inspect('acme-login');
    expect(result.mode).toBe('MOCK');
    expect(result.observation?.text).toContain('No remote inspection occurred');
    expect(validPng(Buffer.from(result.pngBase64!, 'base64'))).toBe(true);
  });
});

describe('passive worker policy', () => {
  it.each(['https://fixture.example/a', 'https://fixture.example:443/a'])(
    'permits normalized HTTPS GET %s',
    (url) => {
      expect(allowedRequest(url, 'GET', ['https://fixture.example'])).toBe(true);
      expect(isAllowedNavigation(url, ['https://fixture.example'])).toBe(true);
    },
  );
  it.each([
    'http://fixture.example/a',
    'https://fixture.example.evil/a',
    'https://fixture.example:8443/a',
    'https://u:p@fixture.example/a',
    'file:///etc/passwd',
    'data:text/html,test',
  ])('blocks %s before navigation', (url) => {
    expect(allowedRequest(url, 'GET', ['https://fixture.example'])).toBe(false);
  });
  it('prevents a form POST even to the approved navigation origin', () => {
    expect(allowedRequest('https://fixture.example/', 'POST', ['https://fixture.example'])).toBe(
      false,
    );
  });
});
