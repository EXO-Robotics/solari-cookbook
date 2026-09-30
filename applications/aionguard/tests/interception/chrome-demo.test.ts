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

async function worker() {
  let listener: (message: unknown, sender: unknown, respond: (value: any) => void) => boolean;
  let onAlarm: (alarm: { name: string }) => void;
  let now = Date.now();
  const saved: Record<string, any> = {};
  const installed = new Map<number, any>([[9999, { id: 9999 }]]);
  const storage = {
    get: vi.fn(async (key: string) => ({ [key]: structuredClone(saved[key]) })),
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
    AIONGUARD_CHROME: { controllerOrigin, fixtureId: 'acme-login', rules: artifacts.rules },
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
      alarms: {
        create: vi.fn(async () => undefined),
        clear: vi.fn(async () => true),
        onAlarm: {
          addListener: (fn: typeof onAlarm) => {
            onAlarm = fn;
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
    alarm: () => onAlarm({ name: 'controlled-click-expiry' }),
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
    expect(block!.condition.resourceTypes).toBeUndefined();
    for (const suffix of ['', '?owned=1', '#section'])
      expect(redirectRegex.test(fixtureUrl + suffix)).toBe(true);
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
      expect(html).toContain('no automatic release');
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
