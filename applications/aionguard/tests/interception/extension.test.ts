import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContext, runInContext, runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { buildExtension, extensionArtifacts } from '../../src/extension/build.ts';

const origin = 'https://fixture.example';
const controller = 'http://127.0.0.1:4317';
const extensionUrl = 'safari-web-extension://unit-extension/hold.html';
const token = 'entry_' + 'a'.repeat(40);
const request = {
  type: 'INSPECT_REGISTERED_FIXTURE',
  fixtureId: 'acme-login',
  requestId: '11111111-1111-4111-8111-111111111111',
};
const sender = { id: 'unit-extension', url: extensionUrl, tab: { id: 1 } };

describe('Safari static interception build', () => {
  it('redirects only the registered main-frame URL and blocks all resource types on the destination origin', () => {
    const { rules, manifest } = extensionArtifacts(origin);
    const redirect = rules.find((rule) => rule.action.type === 'redirect')!;
    const block = rules.find((rule) => rule.action.type === 'block')!;
    expect(redirect.priority).toBeGreaterThan(block.priority);
    expect(redirect.condition.resourceTypes).toEqual(['main_frame']);
    expect(block.condition.resourceTypes).toBeUndefined();
    expect(redirect.action.redirect?.extensionPath).toBe('/hold.html');
    const holdPattern = new RegExp(redirect.condition.regexFilter);
    const blockPattern = new RegExp(block.condition.regexFilter);
    for (const suffix of ['', '?campaign=owned', '#section'])
      expect(holdPattern.test(`${origin}/acme-login.html${suffix}`)).toBe(true);
    expect(holdPattern.test(`${origin}/other.html`)).toBe(false);
    for (const resource of ['/acme-login.html', '/frame.html', '/image.png', '/prefetch'])
      expect(blockPattern.test(`${origin}${resource}`)).toBe(true);
    expect(blockPattern.test('https://fixture.example.evil/a')).toBe(false);
    expect(blockPattern.test('https://other.example/a')).toBe(false);
    expect(manifest.host_permissions).toEqual([`${origin}/*`, `${controller}/*`]);
    expect(manifest).not.toHaveProperty('content_scripts');
    expect(manifest.permissions).toContain('declarativeNetRequestWithHostAccess');
    expect(manifest.declarative_net_request.rule_resources[0]?.enabled).toBe(false);
    expect(JSON.stringify(manifest)).not.toContain('<all_urls>');
  });
  it('holds the exact project URL and confines blocking to that GitHub Pages project', () => {
    const target = 'https://mfrey18.github.io/AionPhish/';
    const { rules, manifest } = extensionArtifacts(target);
    const redirect = rules.find((rule) => rule.action.type === 'redirect')!;
    const block = rules.find((rule) => rule.action.type === 'block')!;
    const holdPattern = new RegExp(redirect.condition.regexFilter);
    const blockPattern = new RegExp(block.condition.regexFilter);
    expect(redirect.condition.resourceTypes).toEqual(['main_frame']);
    expect(redirect.condition.isUrlFilterCaseSensitive).toBe(true);
    expect(block.condition.resourceTypes).toBeUndefined();
    for (const suffix of ['', '?campaign=owned', '#section'])
      expect(holdPattern.test(target + suffix)).toBe(true);
    for (const path of ['/AionPhish', '/AionPhish/index.html', '/AionPhish/assets/logo.png']) {
      const resource = `https://mfrey18.github.io${path}`;
      expect(holdPattern.test(resource)).toBe(false);
      expect(blockPattern.test(resource)).toBe(true);
    }
    for (const resource of [
      target,
      'https://mfrey18.github.io/AionPhish?query=1',
      'https://mfrey18.github.io/AionPhish#fragment',
    ])
      expect(blockPattern.test(resource)).toBe(true);
    for (const resource of [
      'https://mfrey18.github.io/',
      'https://mfrey18.github.io/OtherProject/',
      'https://mfrey18.github.io/AionPhishing/',
      'https://mfrey18.github.io/AionPhish-other/',
      'https://mfrey18.github.io/aionphish/',
      'https://mfrey18.github.io.evil/AionPhish/',
      'https://other.github.io/AionPhish/',
    ]) {
      expect(holdPattern.test(resource)).toBe(false);
      expect(blockPattern.test(resource)).toBe(false);
    }
    expect(manifest.host_permissions).toEqual(['https://mfrey18.github.io/*', `${controller}/*`]);
  });
  it('bounds explicit file targets without changing legacy origin behavior', () => {
    const project = extensionArtifacts('https://fixture.example/project/login.html');
    const projectBlock = new RegExp(project.rules[1]!.condition.regexFilter);
    expect(projectBlock.test('https://fixture.example/project/style.css')).toBe(true);
    expect(projectBlock.test('https://fixture.example/other/style.css')).toBe(false);
    const rootFile = extensionArtifacts('https://fixture.example/login.html');
    const fileBlock = new RegExp(rootFile.rules[1]!.condition.regexFilter);
    expect(fileBlock.test('https://fixture.example/login.html')).toBe(true);
    expect(fileBlock.test('https://fixture.example/login.html?owned=1')).toBe(true);
    expect(fileBlock.test('https://fixture.example/other.html')).toBe(false);
    expect(fileBlock.test('https://fixture.example/login.html/other')).toBe(false);
    expect(() => extensionArtifacts('https://fixture.example/', 'url')).toThrow(
      'Explicit fixture URLs require a non-root path',
    );
  });
  it.each([
    'https://mfrey18.github.io/AionPhish/../OtherProject/',
    'https://mfrey18.github.io/AionPhish/%2e%2e/OtherProject/',
    'https://mfrey18.github.io/AionPhish%2fOtherProject/',
    'https://mfrey18.github.io/AionPhish/?query=1',
    'https://mfrey18.github.io/AionPhish/#fragment',
    'https://mfrey18.github.io:443/AionPhish/',
    'https://mfrey18.github.io:0443/AionPhish/',
  ])('rejects ambiguous build target %s', (target) => {
    expect(() => extensionArtifacts(target)).toThrow();
  });
  it('produces portable resources without deploying or configuring Safari', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aionguard-extension-test-'));
    try {
      await buildExtension(origin, dir);
      expect(await readdir(dir)).toEqual(
        expect.arrayContaining([
          'manifest.json',
          'rules.json',
          'config.js',
          'hold.html',
          'hold.js',
          'background.js',
          'options.html',
        ]),
      );
      expect(JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')).name).toBe('AionGuard');
      const holding = await readFile(join(dir, 'hold.html'), 'utf8');
      expect(holding).not.toContain('<iframe');
      expect(holding).not.toContain('<img');
      expect(holding.replace(/\s+/g, ' ')).toContain('does not prove interception coverage');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

async function background(
  response = new Response(JSON.stringify({ runId: 'run_001' }), { status: 200 }),
) {
  let listener: (message: unknown, sender: unknown) => Promise<unknown> = async () => undefined;
  const status = {
    armed: false,
    recoveryReady: false,
    expiresAt: null as number | null,
    leaseId: null as string | null,
  };
  let protectionReply: (() => Promise<Response>) | undefined;
  const fetch = vi.fn().mockImplementation((url: string) => {
    if (url.endsWith('/api/protection'))
      return protectionReply?.() ?? Promise.resolve(new Response(JSON.stringify(status)));
    if (url.endsWith('/api/protection/disarm')) return Promise.resolve(new Response('{}'));
    return Promise.resolve(response);
  });
  const nativePort = {
    onMessage: { addListener: vi.fn() },
    onDisconnect: { addListener: vi.fn() },
  };
  const runtime = {
    connectNative: vi.fn().mockReturnValue(nativePort),
    id: 'unit-extension',
    getURL: (path: string) => `safari-web-extension://unit-extension/${path}`,
    onMessage: {
      addListener: (callback: typeof listener) => {
        listener = callback;
      },
    },
    onStartup: { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
  };
  const saved: Record<string, unknown> = { entryToken: token, recoveryLatched: false };
  const storage = {
    local: {
      get: vi.fn().mockImplementation(async () => ({ ...saved })),
      set: vi.fn().mockImplementation(async (value) => Object.assign(saved, value)),
    },
    onChanged: { addListener: vi.fn() },
  };
  const rules = {
    getEnabledRulesets: vi.fn().mockResolvedValue([]),
    updateSessionRules: vi.fn().mockResolvedValue(undefined),
    updateDynamicRules: vi.fn().mockResolvedValue(undefined),
    updateEnabledRulesets: vi.fn().mockResolvedValue(undefined),
  };
  const tabs = {
    query: vi.fn().mockResolvedValue([
      { id: 1, url: extensionUrl },
      { id: 2, url: 'https://other.example/' },
    ]),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const alarms = {
    create: vi.fn().mockResolvedValue(undefined),
    onAlarm: { addListener: vi.fn() },
  };
  const context = createContext({
    browser: { runtime, storage, declarativeNetRequest: rules, tabs, alarms },
    AIONGUARD: {
      controllerOrigin: controller,
      fixtureId: 'acme-login',
      rules: extensionArtifacts(origin).rules,
    },
    fetch,
    AbortSignal,
    setInterval: vi.fn(),
  });
  await runInContext(
    await readFile(new URL('../../src/extension/resources/background.js', import.meta.url), 'utf8'),
    context,
  );
  fetch.mockClear();
  tabs.update.mockClear();
  rules.updateSessionRules.mockClear();
  rules.updateDynamicRules.mockClear();
  rules.updateEnabledRulesets.mockClear();
  rules.getEnabledRulesets.mockClear();
  return {
    listener,
    fetch,
    storage,
    status,
    rules,
    tabs,
    saved,
    alarms,
    nativePort,
    retainedNativePort: () => runInContext('nativePort', context),
    setProtectionReply: (reply: () => Promise<Response>) => {
      protectionReply = reply;
    },
  };
}

describe('extension command boundary', () => {
  it('posts a fixed fixture ID with a scoped entry bearer and no source URL', async () => {
    const b = await background();
    expect(await b.listener(request, sender)).toEqual({ ok: true, runId: 'run_001' });
    const [url, options] = b.fetch.mock.calls[0]!;
    expect(url).toBe(`${controller}/api/entry`);
    expect(options.headers.Authorization).toBe(`Bearer ${token}`);
    expect(JSON.parse(options.body)).toEqual({
      fixtureId: 'acme-login',
      requestId: request.requestId,
    });
    expect(options).toMatchObject({ redirect: 'error', credentials: 'omit', cache: 'no-store' });
  });
  it.each([
    { message: { ...request, url: 'https://evil.example' }, sender },
    { message: { ...request, fixtureId: 'unregistered' }, sender },
    { message: request, sender: { ...sender, url: 'https://evil.example/' } },
    { message: request, sender: { ...sender, url: `${extensionUrl}?url=https://evil.example` } },
    { message: request, sender: { ...sender, id: 'different-extension' } },
  ])('rejects an untrusted message or sender without dispatch', async (sample) => {
    const b = await background();
    expect(await b.listener(sample.message, sample.sender)).toEqual({
      ok: false,
      reason: 'INVALID_COMMAND',
    });
    expect(b.fetch).not.toHaveBeenCalled();
  });
  it('keeps the hold when the operator has not preauthorized an attempt', async () => {
    const b = await background(new Response('{}', { status: 409 }));
    expect(await b.listener(request, sender)).toEqual({
      ok: false,
      reason: 'AUTHORIZATION_REQUIRED',
    });
  });
  it('cannot turn a controller reply into arbitrary navigation', async () => {
    const b = await background(
      new Response(JSON.stringify({ runId: '//evil.example/' }), { status: 200 }),
    );
    expect(await b.listener(request, sender)).toEqual({ ok: false, reason: 'INVALID_RESPONSE' });
  });
});

it('creates a new request for each new held navigation while retaining reload idempotency', async () => {
  const script = await readFile(
    new URL('../../src/extension/resources/hold.js', import.meta.url),
    'utf8',
  );
  for (const type of ['navigate', 'reload']) {
    const messages: unknown[] = [];
    const stored = new Map([['aionguard-entry-request', 'old-request']]);
    runInNewContext(script, {
      document: { getElementById: () => ({ textContent: '' }) },
      sessionStorage: {
        getItem: (key: string) => stored.get(key),
        setItem: (key: string, value: string) => stored.set(key, value),
        removeItem: (key: string) => stored.delete(key),
      },
      performance: { getEntriesByType: () => [{ type }] },
      crypto: { randomUUID: () => 'fresh-request' },
      browser: {
        runtime: {
          sendMessage: (message: unknown) => {
            messages.push(message);
            return Promise.resolve({ ok: false });
          },
        },
      },
      AIONGUARD: { controllerOrigin: controller, fixtureId: 'acme-login' },
    });
    await Promise.resolve();
    expect(messages).toEqual([
      {
        type: 'INSPECT_REGISTERED_FIXTURE',
        fixtureId: 'acme-login',
        requestId: type === 'reload' ? 'old-request' : 'fresh-request',
      },
    ]);
  }
});

const settingsSender = {
  id: 'unit-extension',
  url: 'safari-web-extension://unit-extension/options.html',
};
const sync = { type: 'SYNC_PROTECTION' };
const emergency = { type: 'EMERGENCY_DISARM' };

describe('reversible protection lease', () => {
  it('retains the native connection across asynchronous work and releases it on disconnect', async () => {
    const b = await background();
    // This checks the context's strong reference; it does not simulate Safari garbage collection.
    expect(b.retainedNativePort()).toBe(b.nativePort);
    Object.assign(b.status, {
      armed: true,
      recoveryReady: true,
      expiresAt: Date.now() + 30_000,
      leaseId: 'lease_one',
    });
    expect(await b.listener(sync, settingsSender)).toEqual({ ok: true, armed: true });
    expect(b.retainedNativePort()).toBe(b.nativePort);
    b.rules.updateSessionRules.mockClear();
    b.nativePort.onDisconnect.addListener.mock.calls[0]![0]();
    expect(b.retainedNativePort()).toBeNull();
    await vi.waitFor(() => {
      expect(b.rules.updateSessionRules).toHaveBeenCalledWith({ removeRuleIds: [1, 2] });
      expect(b.saved.recoveryLatched).toBe(true);
    });
    expect(await b.listener(sync, settingsSender)).toEqual({ ok: true, armed: false });
    expect(b.rules.updateSessionRules.mock.calls.some(([args]) => args.addRules)).toBe(false);
  });
  it('uses session-only protection for a healthy unexpired explicit lease', async () => {
    const b = await background();
    Object.assign(b.status, {
      armed: true,
      recoveryReady: true,
      expiresAt: Date.now() + 30_000,
      leaseId: 'lease_one',
    });
    expect(await b.listener(sync, settingsSender)).toEqual({ ok: true, armed: true });
    expect(b.rules.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [1, 2],
      addRules: extensionArtifacts(origin).rules,
    });
    expect(b.alarms.create).toHaveBeenCalledWith('aionguard-expiry', { when: b.status.expiresAt });
  });
  it.each([
    { armed: true, recoveryReady: false, expiresAt: Date.now() + 30_000, leaseId: 'lease_one' },
    { armed: true, recoveryReady: true, expiresAt: 1, leaseId: 'lease_one' },
    { armed: true, recoveryReady: true, expiresAt: Date.now() + 600_000, leaseId: 'lease_one' },
    { armed: false, recoveryReady: true, expiresAt: Date.now() + 30_000, leaseId: 'lease_one' },
  ])('removes rules when recovery or lease validation fails', async (state) => {
    const b = await background();
    Object.assign(b.status, state);
    expect(await b.listener(sync, settingsSender)).toEqual({ ok: true, armed: false });
    expect(b.rules.updateSessionRules).toHaveBeenCalledWith({ removeRuleIds: [1, 2] });
    expect(b.rules.updateSessionRules.mock.calls.some(([args]) => args.addRules)).toBe(false);
  });
  it('removes protection locally even if the controller is unavailable', async () => {
    const b = await background();
    b.setProtectionReply(async () => {
      throw new Error('offline');
    });
    await b.listener(sync, settingsSender);
    expect(b.rules.updateSessionRules).toHaveBeenCalledWith({ removeRuleIds: [1, 2] });
    expect(b.saved.recoveryLatched).toBe(true);
    expect(b.tabs.update).toHaveBeenCalledWith(1, { url: `${controller}/?protection=disarmed` });
    expect(b.tabs.update).not.toHaveBeenCalledWith(2, expect.anything());
  });
  it('moves held tabs to the neutral controller when the helper remotely disarms', async () => {
    const b = await background();
    Object.assign(b.status, {
      armed: true,
      recoveryReady: true,
      expiresAt: Date.now() + 30_000,
      leaseId: 'lease_one',
    });
    await b.listener(sync, settingsSender);
    b.status.armed = false;
    await b.listener(sync, settingsSender);
    expect(b.tabs.update).toHaveBeenCalledWith(1, { url: `${controller}/?protection=disarmed` });
  });
  it('requires an observed disarmed state before enabling a subsequent lease after 0000', async () => {
    const b = await background();
    Object.assign(b.status, {
      armed: true,
      recoveryReady: true,
      expiresAt: Date.now() + 30_000,
      leaseId: 'lease_one',
    });
    await b.listener(sync, settingsSender);
    expect(await b.listener(emergency, settingsSender)).toEqual({ ok: true, reason: 'DISARMED' });
    b.rules.updateSessionRules.mockClear();
    await b.listener(sync, settingsSender);
    expect(b.rules.updateSessionRules.mock.calls.some(([args]) => args.addRules)).toBe(false);
    b.status.armed = false;
    await b.listener(sync, settingsSender);
    b.status.armed = true;
    b.status.leaseId = 'lease_two';
    expect(await b.listener(sync, settingsSender)).toEqual({ ok: true, armed: true });
  });
  it('cannot re-arm from an in-flight response after emergency disarm', async () => {
    const b = await background();
    let resolve: (value: Response) => void = () => undefined;
    b.setProtectionReply(
      () =>
        new Promise<Response>((finish) => {
          resolve = finish;
        }),
    );
    const pending = b.listener(sync, settingsSender);
    await vi.waitFor(() => expect(b.fetch).toHaveBeenCalled());
    await b.listener(emergency, settingsSender);
    resolve(
      new Response(
        JSON.stringify({
          armed: true,
          recoveryReady: true,
          expiresAt: Date.now() + 30_000,
          leaseId: 'stale_lease',
        }),
      ),
    );
    await pending;
    expect(b.rules.updateSessionRules.mock.calls.some(([args]) => args.addRules)).toBe(false);
  });
  it('reports an actual rules-removal failure and attempts all independent removals', async () => {
    const b = await background();
    b.rules.getEnabledRulesets.mockResolvedValueOnce(['registered_fixture']);
    b.rules.updateEnabledRulesets.mockRejectedValueOnce(new Error('Safari error'));
    expect(await b.listener(emergency, settingsSender)).toEqual({
      ok: false,
      reason: 'DISABLE_EXTENSION_REQUIRED',
    });
    expect(b.rules.updateSessionRules).toHaveBeenCalledWith({ removeRuleIds: [1, 2] });
    expect(b.rules.updateDynamicRules).toHaveBeenCalledWith({ removeRuleIds: [1, 2] });
  });
  it('skips the static update when the legacy ruleset is already disabled', async () => {
    const b = await background();
    b.rules.updateEnabledRulesets.mockRejectedValue(new Error('Safari disabled-ruleset error'));
    expect(await b.listener(emergency, settingsSender)).toEqual({ ok: true, reason: 'DISARMED' });
    expect(b.rules.getEnabledRulesets).toHaveBeenCalledOnce();
    expect(b.rules.updateEnabledRulesets).not.toHaveBeenCalled();
    expect(b.rules.updateDynamicRules).toHaveBeenCalledWith({ removeRuleIds: [1, 2] });
    expect(b.rules.updateSessionRules).toHaveBeenCalledWith({ removeRuleIds: [1, 2] });
  });
  it('disables only the enabled legacy static ruleset', async () => {
    const b = await background();
    b.rules.getEnabledRulesets.mockResolvedValueOnce(['unrelated_rules', 'registered_fixture']);
    expect(await b.listener(emergency, settingsSender)).toEqual({ ok: true, reason: 'DISARMED' });
    expect(b.rules.updateEnabledRulesets).toHaveBeenCalledExactlyOnceWith({
      disableRulesetIds: ['registered_fixture'],
    });
  });
  it('serializes static query and removal across concurrent disarms', async () => {
    const b = await background();
    let enabled = ['registered_fixture'];
    let finishRemoval: () => void = () => undefined;
    b.rules.getEnabledRulesets.mockImplementation(async () => enabled.slice());
    b.rules.updateEnabledRulesets.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishRemoval = () => {
            enabled = [];
            resolve();
          };
        }),
    );
    const first = b.listener(emergency, settingsSender);
    await vi.waitFor(() => expect(b.rules.updateEnabledRulesets).toHaveBeenCalledOnce());
    const second = b.listener(emergency, settingsSender);
    await vi.waitFor(() => expect(b.rules.updateSessionRules).toHaveBeenCalledTimes(2));
    expect(b.rules.getEnabledRulesets).toHaveBeenCalledOnce();
    finishRemoval();
    expect(await Promise.all([first, second])).toEqual([
      { ok: true, reason: 'DISARMED' },
      { ok: true, reason: 'DISARMED' },
    ]);
    expect(b.rules.getEnabledRulesets).toHaveBeenCalledTimes(2);
    expect(b.rules.updateEnabledRulesets).toHaveBeenCalledOnce();
  });
  it('rejects recovery acknowledgment on a failed static query and permits a later retry', async () => {
    const b = await background();
    const listener = b.nativePort.onMessage.addListener.mock.calls[0]![0];
    b.rules.getEnabledRulesets.mockRejectedValueOnce(new Error('Safari query error'));
    await listener({ type: 'EMERGENCY_DISARM', requestId: request.requestId });
    const failedAck = b.fetch.mock.calls.find(([url]) =>
      url.endsWith('/api/protection/extension-ack'),
    );
    expect(JSON.parse(failedAck![1].body)).toEqual({
      requestId: request.requestId,
      rulesRemoved: false,
    });
    expect(b.rules.updateDynamicRules).toHaveBeenCalledWith({ removeRuleIds: [1, 2] });
    expect(b.rules.updateSessionRules).toHaveBeenCalledWith({ removeRuleIds: [1, 2] });
    b.rules.getEnabledRulesets.mockResolvedValueOnce(['registered_fixture']);
    await listener({ type: 'EMERGENCY_DISARM', requestId: request.requestId });
    const recoveredAck = b.fetch.mock.calls
      .filter(([url]) => url.endsWith('/api/protection/extension-ack'))
      .at(-1);
    expect(JSON.parse(recoveredAck![1].body).rulesRemoved).toBe(true);
    expect(b.rules.updateEnabledRulesets).toHaveBeenCalledExactlyOnceWith({
      disableRulesetIds: ['registered_fixture'],
    });
  });
  it('acknowledges a native emergency only after independent rule removal settles', async () => {
    const b = await background();
    const listener = b.nativePort.onMessage.addListener.mock.calls[0]![0];
    await listener({ type: 'EMERGENCY_DISARM', requestId: request.requestId });
    const ack = b.fetch.mock.calls.find(([url]) => url.endsWith('/api/protection/extension-ack'));
    expect(ack).toBeDefined();
    expect(JSON.parse(ack![1].body)).toEqual({ requestId: request.requestId, rulesRemoved: true });
    b.rules.updateSessionRules.mockRejectedValueOnce(new Error('Safari error'));
    await listener({ userInfo: { type: 'EMERGENCY_DISARM', requestId: request.requestId } });
    const failedAck = b.fetch.mock.calls
      .filter(([url]) => url.endsWith('/api/protection/extension-ack'))
      .at(-1);
    expect(JSON.parse(failedAck![1].body).rulesRemoved).toBe(false);
  });
  it('rejects emergency and synchronization messages from arbitrary websites', async () => {
    const b = await background();
    for (const message of [emergency, sync])
      expect(
        await b.listener(message, { ...settingsSender, url: 'https://evil.example/' }),
      ).toEqual({ ok: false, reason: 'INVALID_COMMAND' });
    expect(b.fetch).not.toHaveBeenCalled();
  });
});

it('detects four real zero presses in extension pages without storing or suppressing keyboard text', async () => {
  let keydown: (event: Record<string, unknown>) => void = () => undefined;
  const sendMessage = vi.fn().mockResolvedValue({ ok: true });
  const status = { textContent: '' };
  runInNewContext(
    await readFile(new URL('../../src/extension/resources/recovery.js', import.meta.url), 'utf8'),
    {
      document: {
        addEventListener: (_: string, callback: typeof keydown) => {
          keydown = callback;
        },
        getElementById: (id: string) => (id === 'disarm' ? { addEventListener: vi.fn() } : status),
      },
      browser: { runtime: { sendMessage } },
    },
  );
  for (const key of ['0', '0', 'x', '0', '0', '0']) keydown({ key });
  keydown({ key: '0', repeat: true });
  expect(sendMessage).not.toHaveBeenCalled();
  keydown({ key: '0' });
  await Promise.resolve();
  expect(sendMessage).toHaveBeenCalledExactlyOnceWith(emergency);
  await vi.waitFor(() => expect(status.textContent).toContain('protection is off'));
});

it('imports an entry token directly from a bounded local file without rendering it', async () => {
  let choose: (event: any) => Promise<void> = async () => undefined;
  const status = { textContent: '' };
  const save = vi.fn().mockResolvedValue(undefined);
  runInNewContext(
    await readFile(new URL('../../src/extension/resources/options.js', import.meta.url), 'utf8'),
    {
      document: {
        getElementById: (id: string) =>
          id === 'status'
            ? status
            : {
                addEventListener: (event: string, handler: typeof choose) => {
                  if (event === 'change') choose = handler;
                },
              },
      },
      browser: { storage: { local: { set: save } } },
    },
  );
  const target = { files: [{ size: token.length, text: async () => `${token}\n` }], value: 'file' };
  await choose({ target });
  expect(save).toHaveBeenCalledExactlyOnceWith({ entryToken: token });
  expect(target.value).toBe('');
  expect(status.textContent).not.toContain(token);
  save.mockClear();
  await choose({ target: { files: [{ size: 513, text: async () => token }], value: 'file' } });
  expect(save).not.toHaveBeenCalled();
});
