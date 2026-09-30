import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
  buildControlledChromeDemo,
  controlledChromeArtifacts,
} from '../../src/extension/chrome-demo/build.ts';

const fixtureUrl = 'https://mfrey18.github.io/AionPhish/';
const controllerOrigin = 'http://127.0.0.1:4317';
const sourceOrigin = 'http://127.0.0.1:5678';
const artifacts = controlledChromeArtifacts({ fixtureUrl, controllerOrigin, sourceOrigin });
const extensionId = 'unit-extension';
const holdUrl = `chrome-extension://${extensionId}/hold.html`;
const entryToken = 'entry_' + 'a'.repeat(48);
const requestId = '11111111-1111-4111-8111-111111111111';
const sender = {
  id: extensionId,
  url: holdUrl,
  frameId: 0,
  tab: { id: 1 },
  documentId: 'document_001',
  documentLifecycle: 'active',
};

async function worker(initialSaved: Record<string, any> = {}, initialRules: any[] = []) {
  let listener: (message: unknown, sender: unknown, respond: (value: any) => void) => boolean;
  const alarmListeners: Array<(alarm: { name: string }) => void> = [];
  let onBeforeNavigate: (details: any) => void;
  let onCommitted: (details: any) => void;
  let onError: (details: any) => void;
  let onRemoved: (tabId: number) => void;
  const tabsUpdate = vi.fn(async () => undefined);
  let now = Date.now();
  const saved: Record<string, any> = structuredClone(initialSaved);
  const installed = new Map<number, any>([
    [9999, { id: 9999 }],
    ...initialRules.map((rule): [number, any] => [rule.id, rule]),
  ]);
  const storage = {
    get: vi.fn(async (key: string | null) =>
      key === null ? structuredClone(saved) : { [key]: structuredClone(saved[key]) },
    ),
    set: vi.fn(async (values: Record<string, any>) =>
      Object.assign(saved, structuredClone(values)),
    ),
    remove: vi.fn(async (keys: string[]) => keys.forEach((key) => delete saved[key])),
    setAccessLevel: vi.fn(async () => undefined),
  };
  const updateSessionRules = vi.fn(async ({ removeRuleIds, addRules = [] }: any) => {
    for (const id of removeRuleIds) installed.delete(id);
    for (const rule of addRules) installed.set(rule.id, rule);
  });
  const contexts = vi.fn(async () => [
    { documentId: 'document_001', documentUrl: holdUrl, tabId: 1, frameId: 0 },
  ]);
  const fetch = vi.fn(async (url: string) =>
    url.endsWith('/status')
      ? new Response(
          JSON.stringify({
            requestId,
            state: 'COMPLETE',
            classification: 'SUSPICIOUS',
            runId: 'run_001',
          }),
        )
      : new Response(JSON.stringify({ runId: 'run_001' }), { status: 202 }),
  );
  const context = createContext({
    importScripts: () => undefined,
    AIONGUARD_CHROME: {
      controllerOrigin,
      fixtureUrl,
      fixtureId: 'acme-login',
      rules: artifacts.rules,
    },
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    chrome: {
      runtime: {
        id: extensionId,
        getContexts: contexts,
        getURL: (path: string) => `chrome-extension://${extensionId}/${path}`,
        onMessage: {
          addListener: (fn: typeof listener) => {
            listener = fn;
          },
        },
      },
      storage: { session: storage },
      declarativeNetRequest: { updateSessionRules },
      tabs: {
        update: tabsUpdate,
        onRemoved: {
          addListener: (fn: typeof onRemoved) => {
            onRemoved = fn;
          },
        },
      },
      webNavigation: {
        onBeforeNavigate: {
          addListener: (fn: typeof onBeforeNavigate) => {
            onBeforeNavigate = fn;
          },
        },
        onCommitted: {
          addListener: (fn: typeof onCommitted) => {
            onCommitted = fn;
          },
        },
        onErrorOccurred: {
          addListener: (fn: typeof onError) => {
            onError = fn;
          },
        },
      },
      alarms: {
        create: vi.fn(async () => undefined),
        clear: vi.fn(async () => true),
        onAlarm: {
          addListener: (fn: (alarm: { name: string }) => void) => {
            alarmListeners.push(fn);
          },
        },
      },
    },
    crypto: { randomUUID },
    fetch,
    AbortController,
    setTimeout,
    clearTimeout,
  });
  runInContext(
    await readFile(
      new URL('../../src/extension/chrome-demo/resources/background.js', import.meta.url),
      'utf8',
    ),
    context,
  );
  return {
    context,
    fetch,
    saved,
    installed,
    updateSessionRules,
    storage,
    contexts,
    advance: (ms: number) => {
      now += ms;
    },
    configure: (value = { entryToken, expiresAt: now + 120000 }) => context.configure(value),
    disarm: () => context.disarm(),
    now: () => now,
    tabsUpdate,
    beforeNavigate: (details = { tabId: 1, frameId: 0 }) => onBeforeNavigate(details),
    commit: (
      details: { tabId: number; frameId: number; url?: string } = {
        tabId: 1,
        frameId: 0,
        url: fixtureUrl,
      },
    ) => onCommitted(details),
    navigationError: (details = { tabId: 1, frameId: 0, url: fixtureUrl }) => onError(details),
    removeTab: (tabId = 1) => onRemoved(tabId),
    alarm: (name = 'controlled-click-expiry') => alarmListeners.forEach((fn) => fn({ name })),
    send: (type = 'INSPECT', from: unknown = sender, extra = {}) =>
      new Promise<any>((resolve) => {
        expect(listener({ type, requestId, ...extra }, from, resolve)).toBe(true);
      }),
  };
}

describe('controlled Chrome build', () => {
  it('holds the exact owned URL before network and scopes the fallback block to its project', () => {
    const [redirect, block] = artifacts.rules;
    const redirectRegex = new RegExp(redirect!.condition.regexFilter);
    const blockRegex = new RegExp(block!.condition.regexFilter);
    expect(redirect!.priority).toBeGreaterThan(block!.priority);
    expect(redirect!.condition.resourceTypes).toEqual(['main_frame']);
    expect(block!.condition.resourceTypes).toContain('main_frame');
    expect(block!.condition.resourceTypes).toContain('script');
    expect(redirectRegex.test(fixtureUrl)).toBe(true);
    for (const suffix of ['?owned=1', '#section'])
      expect(redirectRegex.test(fixtureUrl + suffix)).toBe(false);
    expect(redirectRegex.test(fixtureUrl + 'index.html')).toBe(false);
    for (const path of ['/AionPhish', '/AionPhish/', '/AionPhish/script.js'])
      expect(blockRegex.test('https://mfrey18.github.io' + path)).toBe(true);
    for (const value of [
      'https://mfrey18.github.io/Other/',
      'https://mfrey18.github.io/AionPhishing/',
      'https://mfrey18.github.io.evil/AionPhish/',
    ])
      expect(blockRegex.test(value)).toBe(false);
    expect(artifacts.manifest.host_permissions).toEqual([
      'https://mfrey18.github.io/*',
      `${controllerOrigin}/*`,
    ]);
    expect(artifacts.manifest.background).toEqual({ service_worker: 'background.js' });
    expect(artifacts.manifest.web_accessible_resources[0]?.matches).toEqual([
      'https://mfrey18.github.io/*',
      `${controllerOrigin}/*`,
      `${sourceOrigin}/*`,
    ]);
    expect(artifacts.manifest.permissions).not.toContain('tabs');
    expect(artifacts.manifest).not.toHaveProperty('content_scripts');
    expect(artifacts.manifest).not.toHaveProperty('declarative_net_request');
    expect(JSON.stringify(artifacts)).not.toContain('<all_urls>');
    expect(JSON.stringify(artifacts)).not.toContain(entryToken);
  });

  it.each([
    { fixtureUrl: 'https://mfrey18.github.io/', controllerOrigin },
    { fixtureUrl: fixtureUrl + '../Other/', controllerOrigin },
    { fixtureUrl: fixtureUrl + '?query=1', controllerOrigin },
    { fixtureUrl, controllerOrigin: 'http://localhost:4317' },
    { fixtureUrl, controllerOrigin: 'http://127.0.0.1:4317/' },
    { fixtureUrl, controllerOrigin: 'https://controller.example' },
    { fixtureUrl, controllerOrigin: 'http://127.0.0.1:80' },
  ])('rejects ambiguous or non-loopback build configuration %j', (config) => {
    expect(() => controlledChromeArtifacts({ ...config, sourceOrigin })).toThrow();
  });

  it('builds an unpacked MV3 worker without Safari native permissions or persisted credentials', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aionguard-chrome-test-'));
    try {
      const result = await buildControlledChromeDemo(
        { fixtureUrl, controllerOrigin, sourceOrigin },
        dir,
      );
      expect(result.directory).toBe(dir);
      expect(JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))).toEqual(
        artifacts.manifest,
      );
      expect(await readFile(join(dir, 'config.js'), 'utf8')).not.toContain('entryToken');
      const html = await readFile(join(dir, 'hold.html'), 'utf8');
      expect(html).not.toContain('<iframe');
      expect(html).not.toContain('<img');
      expect(html).toContain('completed check with no findings → open');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.each(['https://other.example', 'http://localhost:5678', `${sourceOrigin}/`])(
    'rejects a source origin outside the exact loopback demonstration: %s',
    (sourceOrigin) => {
      expect(() =>
        controlledChromeArtifacts({ fixtureUrl, controllerOrigin, sourceOrigin }),
      ).toThrow();
    },
  );
});

describe('controlled Chrome worker authority', () => {
  it('starts unarmed and accepts configuration only via the trusted worker global', async () => {
    const w = await worker();
    expect(await w.send()).toMatchObject({ ok: false });
    expect(
      await w.send('CONFIGURE', sender, { entryToken, expiresAt: Date.now() + 5000 }),
    ).toMatchObject({ ok: false });
    expect(w.fetch).not.toHaveBeenCalled();
    await w.configure();
    expect(w.installed.size).toBe(3);
    expect(w.storage.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
    await expect(w.configure({ entryToken, expiresAt: Date.now() + 130000 })).rejects.toThrow();
  });

  it.each([
    { ...sender, id: 'other-extension' },
    { ...sender, url: 'https://mfrey18.github.io/AionPhish/' },
    { ...sender, url: holdUrl + '?spoof=1' },
    { ...sender, frameId: 1 },
    { ...sender, tab: undefined },
    { ...sender, documentId: undefined },
    { ...sender, documentLifecycle: 'cached' },
  ])('rejects a forged or framed sender %j', async (from) => {
    const w = await worker();
    await w.configure();
    expect(await w.send('INSPECT', from)).toMatchObject({ ok: false });
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it('rechecks the live tab and refuses caller-provided URLs', async () => {
    const w = await worker();
    await w.configure();
    expect(await w.send('INSPECT', sender, { url: 'https://other.example/' })).toMatchObject({
      ok: false,
    });
    w.contexts.mockResolvedValue([]);
    expect(await w.send()).toMatchObject({ ok: false });
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it('sends only the registered ID and correlates the same-tab status without exposing credentials', async () => {
    const w = await worker();
    await w.configure();
    const entry = await w.send();
    expect(entry).toMatchObject({ ok: true, runId: 'run_001' });
    const [url, options] = w.fetch.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe(`${controllerOrigin}/api/controlled-click/entry`);
    expect(JSON.parse(options.body as string)).toEqual({ fixtureId: 'acme-login', requestId });
    expect(options.redirect).toBe('error');
    expect(options.credentials).toBe('omit');
    expect(await w.send('STATUS', { ...sender, tab: { id: 2 } })).toMatchObject({ ok: false });
    const result = await w.send('STATUS');
    expect(result).toMatchObject({ ok: true, state: 'COMPLETE', classification: 'SUSPICIOUS' });
    const statusOptions = (w.fetch.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect(statusOptions.method).toBe('POST');
    expect(JSON.parse(statusOptions.body as string)).toEqual({ requestId });
    expect(result.receiptUrl).toBe(`${controllerOrigin}/?run=run_001`);
    expect(JSON.stringify(result)).not.toContain(entryToken);
    expect(w.installed.has(7102)).toBe(true);
    await w.send();
    expect(w.fetch).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent entry messages and rejects request ownership by another tab', async () => {
    const w = await worker();
    await w.configure();
    const results = await Promise.all([
      w.send(),
      w.send(),
      w.send('INSPECT', { ...sender, tab: { id: 2 } }),
    ]);
    expect(results[0]).toMatchObject({ ok: true });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toMatchObject({ ok: false });
    expect(w.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps navigation blocked when the controller is unavailable or returns an unsafe result', async () => {
    const w = await worker();
    await w.configure();
    w.fetch.mockRejectedValueOnce(new Error('private backend failure'));
    expect(await w.send()).toEqual({
      ok: false,
      state: 'ERROR',
      error: 'Navigation remains held.',
    });
    expect(w.installed.has(7102)).toBe(true);
    await w.send();
    w.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ requestId, state: 'COMPLETE', classification: 'SAFE', runId: 'run_001' }),
      ),
    );
    expect(await w.send('STATUS')).toMatchObject({ ok: false });
    expect(w.installed.has(7102)).toBe(true);
  });

  it('checks the lease on each request and leaves the block installed after expiry', async () => {
    const w = await worker();
    await w.configure();
    w.advance(120001);
    expect(await w.send()).toMatchObject({ ok: false });
    expect(w.fetch).not.toHaveBeenCalled();
    w.alarm();
    await vi.waitFor(() => expect(w.saved.lease).toBeUndefined());
    expect(w.installed.has(7101)).toBe(true);
    expect(w.installed.has(7102)).toBe(true);
  });

  it('explicit disarm revokes authorization and removes only its own session rules', async () => {
    const w = await worker();
    await w.configure();
    await w.disarm();
    expect([...w.installed.keys()]).toEqual([9999]);
    expect(w.saved.lease).toBeUndefined();
    expect(await w.send()).toMatchObject({ ok: false });
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it.each(['disarm', 'configure'] as const)(
    'rejects a response whose JSON completes after trusted %s changes the lease',
    async (change) => {
      const w = await worker();
      await w.configure();
      let finishJson!: (value: unknown) => void;
      const body = new Promise((resolve) => {
        finishJson = resolve;
      });
      const json = vi.fn(() => body);
      w.fetch.mockResolvedValueOnce({ ok: true, status: 202, json } as unknown as Response);
      const inspection = w.send();
      await vi.waitFor(() => expect(json).toHaveBeenCalled());
      await w[change]();
      finishJson({ runId: 'run_001' });
      expect(await inspection).toMatchObject({ ok: false, state: 'ERROR' });
      expect(w.saved.requests?.[requestId]).toBeUndefined();
    },
  );
});

function releaseStatus(now: number) {
  return {
    requestId,
    runId: 'run_001',
    state: 'COMPLETE',
    classification: 'UNDETERMINED',
    decision: 'RELEASE',
    execution: 'SUCCEEDED',
    cleanup: 'RETAINED',
    release: {
      policy: 'NO_FINDINGS_V1',
      url: fixtureUrl,
      expiresAt: new Date(now + 10000).toISOString(),
    },
  };
}

async function readyRelease() {
  const w = await worker();
  await w.configure();
  await w.send();
  w.fetch.mockImplementation(async () => new Response(JSON.stringify(releaseStatus(w.now()))));
  return w;
}

describe('controlled Chrome navigation release', () => {
  it('opens a completed no-findings check once with an exact tab-scoped GET main-frame grant', async () => {
    const w = await readyRelease();
    expect(await w.send('RELEASE')).toMatchObject({ ok: true, state: 'RELEASING' });
    expect(w.tabsUpdate).toHaveBeenCalledExactlyOnceWith(1, { url: fixtureUrl });
    const allow = w.installed.get(7103);
    expect(allow.action).toEqual({ type: 'allow' });
    expect(allow.condition).toMatchObject({
      tabIds: [1],
      resourceTypes: ['main_frame'],
      requestMethods: ['get'],
      isUrlFilterCaseSensitive: true,
    });
    const exact = new RegExp(allow.condition.regexFilter);
    expect(exact.test(fixtureUrl)).toBe(true);
    for (const url of [
      fixtureUrl + '?next=1',
      fixtureUrl + 'extra',
      fixtureUrl.replace('https:', 'http:'),
      'https://other.example/',
    ])
      expect(exact.test(url)).toBe(false);
    expect(w.installed.get(7104)).toMatchObject({
      action: { type: 'block' },
      condition: { tabIds: [1], resourceTypes: ['main_frame'] },
    });
    expect(allow.priority).toBeGreaterThan(w.installed.get(7104).priority);
    expect([...w.installed.values()].some((rule) => rule.action?.type === 'allowAllRequests')).toBe(
      false,
    );
    expect(w.saved.requests[requestId].consumed).toBe(true);
    expect(await w.send('RELEASE')).toMatchObject({ ok: false });
    expect(w.tabsUpdate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['checking', { state: 'CHECKING' }],
    ['finding', { classification: 'SUSPICIOUS' }],
    ['review', { decision: 'REVIEW' }],
    ['failed execution', { execution: 'FAILED' }],
    ['pending cleanup', { cleanup: 'PENDING' }],
    ['wrong request', { requestId: '22222222-2222-4222-8222-222222222222' }],
    ['wrong run', { runId: 'run_other' }],
    ['wrong policy', { release: { policy: 'ALLOWLIST_V1' } }],
    ['wrong destination', { release: { url: fixtureUrl + '?other=1' } }],
    ['expired', { release: { expiresAt: '2000-01-01T00:00:00.000Z' } }],
    ['malformed expiry', { release: { expiresAt: 'invalid' } }],
    ['unbounded expiry', { release: { expiresAt: '2999-01-01T00:00:00.000Z' } }],
  ])('keeps held for %s', async (_name, patch) => {
    const w = await readyRelease();
    const good = releaseStatus(w.now());
    const body = {
      ...good,
      ...patch,
      release: { ...good.release, ...('release' in patch ? patch.release : {}) },
    };
    w.fetch.mockImplementation(async () => new Response(JSON.stringify(body)));
    expect(await w.send('RELEASE')).toMatchObject({ ok: false });
    expect(w.tabsUpdate).not.toHaveBeenCalled();
    expect(w.installed.has(7103)).toBe(false);
    expect(w.installed.has(7102)).toBe(true);
  });

  it('rejects absent ownership, a changed document, another tab, and an expired lease', async () => {
    const w = await readyRelease();
    expect(
      await w.send('RELEASE', sender, { requestId: '22222222-2222-4222-8222-222222222222' }),
    ).toMatchObject({ ok: false });
    w.contexts.mockResolvedValue([
      { documentId: 'document_002', documentUrl: holdUrl, tabId: 1, frameId: 0 },
    ]);
    expect(await w.send('RELEASE', { ...sender, documentId: 'document_002' })).toMatchObject({
      ok: false,
    });
    w.contexts.mockResolvedValue([
      { documentId: sender.documentId, documentUrl: holdUrl, tabId: 2, frameId: 0 },
    ]);
    expect(await w.send('RELEASE', { ...sender, tab: { id: 2 } })).toMatchObject({ ok: false });
    w.contexts.mockResolvedValue([
      { documentId: sender.documentId, documentUrl: holdUrl, tabId: 1, frameId: 0 },
    ]);
    w.advance(120001);
    expect(await w.send('RELEASE')).toMatchObject({ ok: false });
    expect(w.tabsUpdate).not.toHaveBeenCalled();
  });

  it.each(['commit', 'navigationError', 'removeTab', 'expiry'] as const)(
    'revokes the temporary gate after %s without removing the hold',
    async (event) => {
      const w = await readyRelease();
      await w.send('RELEASE');
      if (event === 'expiry') {
        w.advance(10001);
        w.alarm('controlled-release-expiry');
      } else w[event]();
      await vi.waitFor(() => expect(w.installed.has(7103)).toBe(false));
      expect(w.installed.has(7104)).toBe(false);
      expect(w.installed.has(7105)).toBe(event === 'commit');
      expect(w.installed.has(7102)).toBe(true);
      expect(w.saved.release).toBeUndefined();
      expect(await w.send('RELEASE')).toMatchObject({ ok: false });
    },
  );

  it('retains only path-scoped subresources after commit, then removes them on the next navigation', async () => {
    const w = await readyRelease();
    await w.send('RELEASE');
    const assets = w.installed.get(7105);
    expect(assets.action).toEqual({ type: 'allow' });
    expect(assets.condition).toEqual({
      regexFilter: artifacts.rules[1]!.condition.regexFilter,
      isUrlFilterCaseSensitive: true,
      tabIds: [1],
      excludedResourceTypes: ['main_frame', 'sub_frame'],
    });
    w.commit();
    await vi.waitFor(() => expect(w.saved.release).toBeUndefined());
    expect(w.installed.has(7103)).toBe(false);
    expect(w.installed.has(7105)).toBe(true);
    w.beforeNavigate();
    await vi.waitFor(() => expect(w.installed.has(7105)).toBe(false));
  });

  it('ignores commits in unrelated tabs and subframes', async () => {
    const w = await readyRelease();
    await w.send('RELEASE');
    w.commit({ tabId: 2, frameId: 0 });
    w.commit({ tabId: 1, frameId: 1 });
    await w.context.serialize(async () => undefined);
    expect(w.installed.has(7103)).toBe(true);
  });

  it('consumes concurrent release attempts only once', async () => {
    const w = await readyRelease();
    const results = await Promise.all([w.send('RELEASE'), w.send('RELEASE')]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(w.tabsUpdate).toHaveBeenCalledTimes(1);
  });

  it.each(['disarm', 'configure'] as const)(
    'rejects a release response after %s replaces its authority',
    async (change) => {
      const w = await readyRelease();
      let finishJson!: (value: unknown) => void;
      const body = new Promise((resolve) => {
        finishJson = resolve;
      });
      const json = vi.fn(() => body);
      w.fetch.mockResolvedValueOnce({ ok: true, status: 200, json } as unknown as Response);
      const result = w.send('RELEASE');
      await vi.waitFor(() => expect(json).toHaveBeenCalled());
      await w[change]();
      finishJson(releaseStatus(w.now()));
      expect(await result).toMatchObject({ ok: false });
      expect(w.tabsUpdate).not.toHaveBeenCalled();
      expect(w.installed.has(7103)).toBe(false);
    },
  );

  it('rechecks the document after the controller response before opening the gate', async () => {
    const w = await readyRelease();
    w.fetch.mockImplementationOnce(async () => {
      w.contexts.mockResolvedValue([]);
      return new Response(JSON.stringify(releaseStatus(w.now())));
    });
    expect(await w.send('RELEASE')).toMatchObject({ ok: false });
    expect(w.tabsUpdate).not.toHaveBeenCalled();
    expect(w.installed.has(7103)).toBe(false);
  });

  it('does not navigate when installing the temporary rules fails', async () => {
    const w = await readyRelease();
    w.updateSessionRules.mockRejectedValueOnce(new Error('Rules unavailable'));
    expect(await w.send('RELEASE')).toMatchObject({ ok: false });
    expect(w.tabsUpdate).not.toHaveBeenCalled();
    expect(w.saved.release).toBeUndefined();
    expect(w.saved.requests[requestId].consumed).toBe(true);
    expect(w.installed.has(7103)).toBe(false);
  });

  it('revalidates controller authority after waiting in the mutation queue', async () => {
    const w = await readyRelease();
    let unblock!: () => void;
    const queued = w.context.serialize(
      () =>
        new Promise<void>((resolve) => {
          unblock = resolve;
        }),
    );
    let decision = 'RELEASE';
    w.fetch.mockImplementation(
      async () => new Response(JSON.stringify({ ...releaseStatus(w.now()), decision })),
    );
    const result = w.send('RELEASE');
    await vi.waitFor(() => expect(w.fetch).toHaveBeenCalledTimes(2));
    decision = 'REVIEW';
    unblock();
    await queued;
    expect(await result).toMatchObject({ ok: false });
    expect(w.fetch).toHaveBeenCalledTimes(3);
    expect(w.tabsUpdate).not.toHaveBeenCalled();
  });

  it.each(['runId', 'requestId'])(
    'rejects changed %s in the serialized status recheck',
    async (key) => {
      const w = await readyRelease();
      w.fetch.mockResolvedValueOnce(new Response(JSON.stringify(releaseStatus(w.now()))));
      w.fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ ...releaseStatus(w.now()), [key]: 'changed' })),
      );
      expect(await w.send('RELEASE')).toMatchObject({ ok: false });
      expect(w.tabsUpdate).not.toHaveBeenCalled();
    },
  );

  it('ignores stale hold and blank-page commit/error events while a grant is active', async () => {
    const w = await readyRelease();
    await w.send('RELEASE');
    for (const url of [holdUrl, 'about:blank']) {
      w.commit({ tabId: 1, frameId: 0, url });
      w.navigationError({ tabId: 1, frameId: 0, url });
    }
    await w.context.serialize(async () => undefined);
    expect(w.installed.has(7103)).toBe(true);
    expect(w.saved.release).toBeDefined();
  });

  it('keeps committed assets for other tabs, and removes them when their own tab closes', async () => {
    const w = await readyRelease();
    await w.send('RELEASE');
    w.commit();
    await vi.waitFor(() => expect(w.saved.assetTab).toBe(1));
    w.beforeNavigate({ tabId: 2, frameId: 0 });
    w.removeTab(2);
    await w.context.serialize(async () => undefined);
    expect(w.installed.has(7105)).toBe(true);
    w.removeTab(1);
    await vi.waitFor(() => expect(w.installed.has(7105)).toBe(false));
    expect(w.saved.assetTab).toBeUndefined();
  });

  it.each([-1000, 10000])(
    'revokes an interrupted grant at worker startup, expiry offset %i',
    async (offset) => {
      const w = await worker(
        {
          release: { tabId: 1, requestId, expiresAt: Date.now() + offset },
          requests: { [requestId]: { tabId: 1, documentId: sender.documentId, consumed: true } },
        },
        [{ id: 7103 }, { id: 7104 }, { id: 7105 }, { id: 7102 }],
      );
      await w.context.serialize(async () => undefined);
      expect(w.saved.release).toBeUndefined();
      expect(w.saved.requests[requestId].consumed).toBe(true);
      expect([...w.installed.keys()]).toEqual([9999, 7102]);
      expect(w.tabsUpdate).not.toHaveBeenCalled();
    },
  );

  it('removes the gate and consumes the grant if navigation fails', async () => {
    const w = await readyRelease();
    w.tabsUpdate.mockRejectedValueOnce(new Error('Tab closed'));
    expect(await w.send('RELEASE')).toMatchObject({ ok: false });
    expect(w.installed.has(7103)).toBe(false);
    expect(w.saved.release).toBeUndefined();
    expect(w.saved.requests[requestId].consumed).toBe(true);
    expect(await w.send('RELEASE')).toMatchObject({ ok: false });
  });
});
