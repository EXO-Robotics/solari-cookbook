import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmod, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { CaseSnapshotSchema, WarmPoolStatusSchema } from '../src/contracts/index.ts';
import { buildControlledChromeDemo } from '../src/extension/chrome-demo/build.ts';
import { readConfig } from '../src/server/runtime/config.ts';
import { solariConfigFromEnv } from '../src/server/isolation/solari.ts';
import { summarizeNetLog, validateControlledComparison } from './controlled-click-evidence.ts';

let stage = 'INITIALIZATION';
const scenarios = [
  {
    name: 'benign',
    fixture: 'https://mfrey18.github.io/AionPhish/celebration.html',
    releaseExpected: true,
  },
  { name: 'phishing', fixture: 'https://mfrey18.github.io/AionPhish/', releaseExpected: false },
] as const;
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonicalJson(item))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}

async function browserEvidence(
  page: Page,
  target: string,
  canary: string,
  privateDirectory: string,
) {
  const cdp = await page.context().newCDPSession(page);
  const browserVersion = (await cdp.send('Browser.getVersion')).product;
  const argv = (await cdp.send('Browser.getBrowserCommandLine')).arguments.map((arg, index) =>
    index === 0
      ? '<pinned-playwright-chromium>'
      : arg.replaceAll(privateDirectory, '<private-output>'),
  );
  const requestUrls = new Map<string, Set<string>>();
  const requestTimes = new Map<string, number>();
  const extra: { requestId: string; host: string | null }[] = [];
  cdp.on('Network.requestWillBeSent', (event) => {
    requestTimes.set(event.requestId, event.wallTime * 1000);
    const urls = requestUrls.get(event.requestId) ?? new Set<string>();
    urls.add(new URL(event.request.url).origin);
    requestUrls.set(event.requestId, urls);
  });
  cdp.on('Network.requestWillBeSentExtraInfo', (event) => {
    // Read the destination authority solely for correlation; never persist headers.
    const host = Object.entries(event.headers).find(([name]) =>
      ['host', ':authority'].includes(name.toLowerCase()),
    )?.[1];
    extra.push({
      requestId: event.requestId,
      host: typeof host === 'string' ? host.toLowerCase() : null,
    });
  });
  await cdp.send('Network.enable');
  return {
    browserVersion,
    argv,
    finish: async () => {
      await cdp.detach();
      const targetUrl = new URL(target),
        canaryUrl = new URL(canary);
      if (extra.some((event) => event.host === null)) throw new Error('CDP_AUTHORITY_MISSING');
      const targetSends = extra.filter((event) => event.host === targetUrl.host.toLowerCase());
      if (targetSends.some((event) => !requestUrls.get(event.requestId)?.has(targetUrl.origin)))
        throw new Error('CDP_REQUEST_CORRELATION');
      const canarySends = extra.filter(
        (event) => event.host === canaryUrl.host.toLowerCase(),
      ).length;
      if (!canarySends) throw new Error('CDP_CANARY_ABSENT');
      return {
        method: 'CDP_REQUEST_EXTRA_INFO_AUTHORITY_AND_REQUEST_ID',
        destinationRequestsSent: targetSends.length,
        firstDestinationRequestEpochMs: targetSends.length
          ? Math.min(...targetSends.map((event) => requestTimes.get(event.requestId)!))
          : null,
        canaryRequestsSent: canarySends,
        totalRequestExtraInfoEvents: extra.length,
      };
    },
  };
}

async function runScenario(output: string, fixture: string, releaseExpected: boolean) {
  const project = resolve('.');
  if (!output.startsWith(resolve('runtime-data') + sep)) throw new Error('OUTPUT');
  await mkdir(output, { recursive: true, mode: 0o700 });
  await writeFile(
    resolve(output, 'started.json'),
    JSON.stringify({ startedAt: new Date().toISOString() }),
    { flag: 'wx', mode: 0o600 },
  );
  await chmod(output, 0o700);
  const sourceFiles: { path: string; sha256: string }[] = [];
  async function captureSource(directory: string) {
    for (const item of await readdir(resolve(project, directory), { withFileTypes: true })) {
      const path = `${directory}/${item.name}`;
      if (item.isDirectory()) await captureSource(path);
      else if (item.isFile())
        sourceFiles.push({ path, sha256: sha256(await readFile(resolve(project, path))) });
      else throw new Error('SOURCE_SYMLINK');
    }
  }
  for (const directory of ['src', 'scripts', 'tests', 'dist']) await captureSource(directory);
  for (const path of ['package.json', 'package-lock.json', 'tsconfig.json'])
    sourceFiles.push({ path, sha256: sha256(await readFile(resolve(project, path))) });
  sourceFiles.sort((a, b) => a.path.localeCompare(b.path));
  const sourceManifest = {
    capturedAt: new Date().toISOString(),
    method: 'SHA256_EACH_SOURCE_FILE',
    files: sourceFiles,
  };
  const sourceManifestText = JSON.stringify(sourceManifest, null, 2) + '\n';
  await writeFile(resolve(output, 'source-manifest.json'), sourceManifestText, { mode: 0o600 });
  await cp(resolve(project, 'dist'), resolve(output, 'dist'), { recursive: true });
  readConfig();
  process.env.AIONGUARD_FIXTURE_URL = fixture;
  const config = solariConfigFromEnv(process.env);
  if (
    !config ||
    config.fixture.url !== fixture ||
    config.fixture.identityProviderOrigins.includes(new URL(fixture).origin)
  )
    throw new Error('FIXTURE_CONFIG');
  const controllerPort = Number(process.env.AIONGUARD_CLICK_DEMO_PORT ?? '4341');
  if (!Number.isInteger(controllerPort) || controllerPort < 1024 || controllerPort > 65535)
    throw new Error('PORT');
  const controllerOrigin = `http://127.0.0.1:${controllerPort}`;
  const token = randomBytes(32).toString('base64url');
  const entryToken = randomBytes(32).toString('base64url');
  const api = async (path: string, body?: unknown): Promise<unknown> => {
    const result = await fetch(controllerOrigin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!result.ok) throw new Error('CONTROLLER_REQUEST');
    return result.json();
  };
  const sourcePage = createServer((_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-DNS-Prefetch-Control': 'off',
    });
    res.end(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AionGuard controlled click</title><style>body{background:#0b1020;color:#e8efff;font:20px system-ui;margin:0;padding:80px}main{max-width:850px;margin:auto}small{color:#91a4c4}h1{font-size:48px;line-height:1.12}article{background:#14203a;border:1px solid #344460;padding:36px;border-radius:18px}a{display:inline-block;color:#082319;background:#71f0bc;padding:15px 22px;border-radius:8px;font-weight:650;text-decoration:none}p{line-height:1.65;color:#c4d0e5}footer{margin-top:35px;font-size:15px;color:#91a4c4}</style></head><body><main><small>AIONGUARD · CONTROLLED DEMONSTRATION</small><h1>An external link. Two different paths.</h1><article><small>OWNED CONTROLLED FIXTURE · NO REAL CREDENTIALS</small><h2>Inspect this link before opening</h2><p>This ordinary link points to our registered test page. In the protected run, the extension holds this navigation while Solari inspects the destination.</p><a id="fixture-link" href="${fixture}">Review your account →</a></article><footer>Baseline: direct navigation. Protected: hold, inspect, then release or warning.</footer></main></body></html>`,
    );
  });
  await new Promise<void>((done, reject) => {
    sourcePage.once('error', reject);
    sourcePage.listen(0, '127.0.0.1', done);
  });
  const address = sourcePage.address();
  if (!address || typeof address === 'string') throw new Error('SOURCE_SERVER');
  const sourceOrigin = `http://127.0.0.1:${address.port}`;
  const extension = await buildControlledChromeDemo(
    { fixtureUrl: fixture, controllerOrigin, sourceOrigin },
    resolve(output, 'extension'),
  ).catch(async (error: unknown) => {
    sourcePage.closeAllConnections();
    await new Promise<void>((done) => sourcePage.close(() => done()));
    throw error;
  });
  let baseline: BrowserContext | undefined;
  let protectedBrowser: BrowserContext | undefined;
  let controller: ChildProcess | undefined;
  let controllerExit: Promise<number | null> | undefined;
  let controllerOutput = '';
  let diagnosticPage: Page | undefined;
  const browserErrors: { kind: string; message: string }[] = [];
  const observeErrors = (page: Page) => {
    page.on('pageerror', (error) => {
      if (browserErrors.length < 50)
        browserErrors.push({ kind: 'pageerror', message: error.message.slice(0, 8000) });
    });
    page.on('console', (message) => {
      if (message.type() === 'error' && browserErrors.length < 50)
        browserErrors.push({ kind: 'console', message: message.text().slice(0, 8000) });
    });
  };
  let stopping = false;
  const interrupted = () => {
    stopping = true;
    controller?.kill('SIGTERM');
    void Promise.allSettled(contexts.map((context) => context.close()));
  };
  process.on('SIGINT', interrupted);
  process.on('SIGTERM', interrupted);
  const contexts: BrowserContext[] = [];
  let closeCode: number | null = null;
  let report: Record<string, unknown> | undefined;
  const launch = async (name: string, withExtension: boolean) => {
    if (stopping) throw new Error('INTERRUPTED');
    const context = await chromium.launchPersistentContext(resolve(output, `${name}-profile`), {
      channel: 'chromium',
      headless: true,
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: resolve(output, `${name}-video`), size: { width: 1280, height: 800 } },
      args: [
        `--log-net-log=${resolve(output, `${name}-netlog.private.json`)}`,
        '--net-log-capture-mode=Default',
        '--disable-quic',
        '--disable-http2',
        '--disable-background-networking',
        ...(withExtension
          ? [
              `--disable-extensions-except=${extension.directory}`,
              `--load-extension=${extension.directory}`,
            ]
          : []),
      ],
    });
    contexts.push(context);
    for (const page of context.pages()) observeErrors(page);
    context.on('page', observeErrors);
    return context;
  };
  try {
    stage = 'BROWSER_START';
    protectedBrowser = await launch('protected', true);
    const worker =
      protectedBrowser.serviceWorkers()[0] ??
      (await protectedBrowser.waitForEvent('serviceworker', { timeout: 20_000 }));
    const extensionOrigin =
      new URL(worker.url()).origin === 'null'
        ? `chrome-extension://${new URL(worker.url()).host}`
        : new URL(worker.url()).origin;
    if (!/^chrome-extension:\/\/[a-p]{32}$/.test(extensionOrigin)) throw new Error('EXTENSION_ID');
    if (stopping) throw new Error('INTERRUPTED');
    stage = 'CONTROLLER_START';
    controller = spawn(
      process.execPath,
      [
        '--import',
        pathToFileURL(resolve(project, 'node_modules/tsx/dist/loader.mjs')).href,
        resolve(project, 'src/server/main.ts'),
      ],
      {
        cwd: output,
        env: {
          ...process.env,
          AIONGUARD_PORT: String(controllerPort),
          AIONGUARD_MODE: 'LIVE',
          AIONGUARD_PROVIDER: 'SOLARI',
          AIONGUARD_WORKFLOW: 'DETECTOR',
          AIONGUARD_SOLARI_SESSION: 'WARM',
          AIONGUARD_CONTROLLED_CLICK_DEMO: 'true',
          AIONGUARD_EXTENSION_ORIGINS: extensionOrigin,
          AIONGUARD_CONTROLLER_TOKEN: token,
          AIONGUARD_ENTRY_TOKEN: entryToken,
          AIONGUARD_FIXTURE_URL: fixture,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    controllerExit = new Promise((done, reject) => {
      controller!.once('exit', done);
      controller!.once('error', reject);
    });
    controller.stdout?.on('data', (data: Buffer) => {
      controllerOutput += data.toString();
    });
    controller.stderr?.on('data', (data: Buffer) => {
      controllerOutput += data.toString();
    });
    let listening = false;
    for (let i = 0; i < 100; i++) {
      if (controller.exitCode !== null) throw new Error('CONTROLLER_EXIT');
      try {
        await api('/api/health');
        listening = true;
        break;
      } catch {
        await delay(100);
      }
    }
    if (!listening) throw new Error('CONTROLLER_START');
    stage = 'BASELINE';
    baseline = await launch('baseline', false);
    const baselinePage = baseline.pages()[0] ?? (await baseline.newPage());
    diagnosticPage = baselinePage;
    const baselineBrowserEvidence = await browserEvidence(
      baselinePage,
      fixture,
      sourceOrigin,
      output,
    );
    await baselinePage.goto(sourceOrigin, { waitUntil: 'load' });
    await baselinePage.screenshot({ path: resolve(output, 'source-link.png') });
    const baselineStart = performance.now();
    await baselinePage.locator('#fixture-link').click();
    await baselinePage.waitForURL(fixture, { waitUntil: 'load', timeout: 30_000 });
    const baselineNavigationMs = performance.now() - baselineStart;
    await baselinePage.screenshot({ path: resolve(output, 'baseline-destination.png') });
    await delay(1000);
    const baselineFinalUrl = baselinePage.url();
    const baselineCdp = await baselineBrowserEvidence.finish();
    await baseline.close();
    baseline = undefined;
    stage = 'PREWARM';
    let ready = WarmPoolStatusSchema.parse(await api('/api/sandbox'));
    for (let i = 0; ready.state !== 'READY' && i < 240; i++) {
      if (['BLOCKED', 'CLOSED', 'DISABLED'].includes(ready.state))
        throw new Error('SANDBOX_NOT_READY');
      await delay(500);
      ready = WarmPoolStatusSchema.parse(await api('/api/sandbox'));
    }
    if (ready.state !== 'READY' || ready.inspectionCount !== 0) throw new Error('PREWARM');
    stage = 'ARM';
    const attempt = CaseSnapshotSchema.parse(await api('/api/attempts', { variant: 'CANONICAL' }));
    await api(`/api/attempts/${attempt.identity.runId}/authorize`, {
      scenario: 'OWNED_FIXTURE_INSPECTION',
      assumptions: [],
      change: 'NONE',
    });
    const arm = (await api('/api/controlled-click/arm', {
      runId: attempt.identity.runId,
      durationMs: 120_000,
    })) as { expiresAt: string | number };
    const expiresAt = typeof arm.expiresAt === 'string' ? Date.parse(arm.expiresAt) : arm.expiresAt;
    if (!Number.isFinite(expiresAt)) throw new Error('LEASE');
    const armed = await worker.evaluate(
      async ({ entryToken, expiresAt }) => {
        const api = globalThis as typeof globalThis & {
          configure(input: { entryToken: string; expiresAt: number }): Promise<{ armed: boolean }>;
        };
        return api.configure({ entryToken, expiresAt });
      },
      { entryToken, expiresAt },
    );
    if (!armed.armed) throw new Error('EXTENSION_NOT_ARMED');
    const installedRules = await worker.evaluate(async () => {
      const g = globalThis as typeof globalThis & {
        chrome: { declarativeNetRequest: { getSessionRules(): Promise<unknown[]> } };
      };
      return g.chrome.declarativeNetRequest.getSessionRules();
    });
    const expectedRuleSha256 = sha256(canonicalJson(extension.rules));
    const installedRuleSha256 = sha256(canonicalJson(installedRules));
    if (expectedRuleSha256 !== installedRuleSha256) throw new Error('DNR_RULES_MISMATCH');
    const protectedPage = protectedBrowser.pages()[0] ?? (await protectedBrowser.newPage());
    diagnosticPage = protectedPage;
    const protectedBrowserEvidence = await browserEvidence(
      protectedPage,
      fixture,
      sourceOrigin,
      output,
    );
    let destinationLoadedEpochMs: number | null = null;
    const timing: {
      clickEpochMs: number | null;
      decisionEpochMs: number | null;
      trusted: boolean;
      clickNodeMs: number | null;
      decisionNodeMs: number | null;
    } = {
      clickEpochMs: null,
      decisionEpochMs: null,
      trusted: false,
      clickNodeMs: null,
      decisionNodeMs: null,
    };
    await protectedBrowser.exposeBinding(
      'aionguardTiming',
      (_source, event: { kind: string; epochMs: number; trusted?: boolean }) => {
        if (event.kind === 'loaded') destinationLoadedEpochMs = event.epochMs;
        if (event.kind === 'click' && timing.clickEpochMs === null) {
          timing.clickEpochMs = event.epochMs;
          timing.trusted = event.trusted === true;
          timing.clickNodeMs = performance.now();
        }
        if (event.kind === 'decision' && timing.decisionEpochMs === null) {
          timing.decisionEpochMs = event.epochMs;
          timing.decisionNodeMs = performance.now();
        }
      },
    );
    await protectedBrowser.addInitScript(
      ({ fixture, releaseExpected }) => {
        const g = globalThis as typeof globalThis & {
          aionguardTiming(event: {
            kind: string;
            epochMs: number;
            trusted?: boolean;
          }): Promise<void>;
        };
        document.addEventListener(
          'click',
          (event) => {
            if ((event.target as Element | null)?.closest('#fixture-link'))
              void g.aionguardTiming({
                kind: 'click',
                epochMs: performance.timeOrigin + performance.now(),
                trusted: event.isTrusted,
              });
          },
          true,
        );
        window.addEventListener('load', () => {
          if (location.href === fixture)
            void g.aionguardTiming({
              kind: 'loaded',
              epochMs: performance.timeOrigin + performance.now(),
            });
        });
        let complete = false;
        new MutationObserver(() => {
          if (
            !complete &&
            document.body?.dataset.state === (releaseExpected ? 'RELEASING' : 'COMPLETE')
          ) {
            complete = true;
            if (releaseExpected) {
              void g.aionguardTiming({
                kind: 'decision',
                epochMs: performance.timeOrigin + performance.now(),
              });
              return;
            }
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                void g.aionguardTiming({
                  kind: 'decision',
                  epochMs: performance.timeOrigin + performance.now(),
                });
              }),
            );
          }
        }).observe(document, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['data-state'],
        });
      },
      { fixture, releaseExpected },
    );
    stage = 'PROTECTED_CLICK';
    await protectedPage.goto(sourceOrigin, { waitUntil: 'load' });
    const box = await protectedPage.locator('#fixture-link').boundingBox();
    if (!box) throw new Error('CLICK_TARGET');
    const dispatchStart = performance.now();
    await protectedPage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    if (releaseExpected)
      await protectedPage.waitForURL(fixture, { waitUntil: 'load', timeout: 60_000 });
    else
      await protectedPage
        .locator('body[data-state="COMPLETE"][data-classification="SUSPICIOUS"]')
        .waitFor({ timeout: 60_000 });
    const dispatchToDecisionObservedMs = performance.now() - dispatchStart;
    for (let i = 0; i < 20 && timing.decisionEpochMs === null; i++) await delay(50);
    if (
      !timing.trusted ||
      timing.clickEpochMs === null ||
      timing.decisionEpochMs === null ||
      timing.decisionEpochMs < timing.clickEpochMs
    )
      throw new Error('CLICK_TIMING');
    const protectedFinalUrl = protectedPage.url();
    if (
      releaseExpected
        ? protectedFinalUrl !== fixture
        : !protectedFinalUrl.startsWith(extensionOrigin + '/')
    )
      throw new Error('FINAL_NAVIGATION');
    await protectedPage.screenshot({
      path: resolve(output, releaseExpected ? 'protected-released.png' : 'protected-warning.png'),
    });
    const snapshot = CaseSnapshotSchema.parse(await api(`/api/attempts/${attempt.identity.runId}`));
    if (
      snapshot.inspectionTrigger !== 'CHROME_HANDOFF' ||
      snapshot.link.classification !== (releaseExpected ? 'UNDETERMINED' : 'SUSPICIOUS') ||
      snapshot.link.decision !== (releaseExpected ? 'RELEASE' : 'BLOCK') ||
      (releaseExpected && snapshot.link.findings.length !== 0) ||
      snapshot.link.execution !== 'SUCCEEDED'
    )
      throw new Error('INSPECTION_RESULT');
    await writeFile(
      resolve(output, 'receipt.json'),
      JSON.stringify(await api(`/api/attempts/${attempt.identity.runId}/receipt`), null, 2) + '\n',
      { mode: 0o600 },
    );
    // Continue observing after the warning; do not close at the exact decision boundary.
    await delay(2000);
    const observationEndedAt = new Date().toISOString();
    const protectedCdp = await protectedBrowserEvidence.finish();
    if (
      baselineCdp.destinationRequestsSent < 1 ||
      (releaseExpected
        ? protectedCdp.destinationRequestsSent < 1
        : protectedCdp.destinationRequestsSent !== 0)
    )
      throw new Error('CDP_COMPARISON');
    if (releaseExpected && protectedCdp.firstDestinationRequestEpochMs! < timing.decisionEpochMs!)
      throw new Error('DESTINATION_BEFORE_RELEASE_REQUEST');
    const releaseState = await worker.evaluate(async () => {
      const g = globalThis as typeof globalThis & {
        chrome: {
          storage: {
            session: {
              get(
                keys: string[],
              ): Promise<{ release?: unknown; requests?: Record<string, { consumed?: boolean }> }>;
            };
          };
        };
      };
      const state = await g.chrome.storage.session.get(['release', 'requests']);
      return {
        pendingRelease: !!state.release,
        consumedRequests: Object.values(state.requests ?? {}).filter((request) => request.consumed)
          .length,
      };
    });
    if (releaseState.pendingRelease || releaseState.consumedRequests !== (releaseExpected ? 1 : 0))
      throw new Error('RELEASE_AUTHORITY_NOT_CONSUMED');
    const rulesAfterNavigation = await worker.evaluate(async () => {
      const g = globalThis as typeof globalThis & {
        chrome: { declarativeNetRequest: { getSessionRules(): Promise<{ id: number }[]> } };
      };
      return g.chrome.declarativeNetRequest.getSessionRules();
    });
    if (rulesAfterNavigation.some((rule) => [7103, 7104].includes(rule.id)))
      throw new Error('RELEASE_RULES_REMAIN');
    if (
      releaseExpected &&
      (destinationLoadedEpochMs === null || destinationLoadedEpochMs < timing.clickEpochMs!)
    )
      throw new Error('LOAD_TIMING');
    await protectedBrowser.close();
    protectedBrowser = undefined;
    stage = 'NETWORK_EVIDENCE';
    const baselineLog = await readFile(resolve(output, 'baseline-netlog.private.json'));
    const protectedLog = await readFile(resolve(output, 'protected-netlog.private.json'));
    await chmod(resolve(output, 'baseline-netlog.private.json'), 0o600);
    await chmod(resolve(output, 'protected-netlog.private.json'), 0o600);
    const baselineEvidence = summarizeNetLog(
      JSON.parse(baselineLog.toString()),
      fixture,
      sourceOrigin,
    );
    const protectedEvidence = summarizeNetLog(
      JSON.parse(protectedLog.toString()),
      fixture,
      sourceOrigin,
    );
    if (releaseExpected) {
      if (
        baselineEvidence.destinationDocumentRequestsSent < 1 ||
        protectedEvidence.destinationDocumentRequestsSent < 1
      )
        throw new Error('RELEASE_NOT_SENT');
    } else validateControlledComparison(baselineEvidence, protectedEvidence);
    if (
      protectedEvidence.destinationRequestsSent !== protectedCdp.destinationRequestsSent ||
      baselineEvidence.destinationRequestsSent !== baselineCdp.destinationRequestsSent
    )
      throw new Error('NETWORK_COUNTS_DISAGREE');
    report = {
      sourceManifestSha256: sha256(sourceManifestText),
      schemaVersion: '1.0.0',
      status: 'PASS',
      fixture,
      capturedAt: new Date().toISOString(),
      observationEndedAt,
      browser: {
        name: 'Chromium',
        version: protectedBrowserEvidence.browserVersion,
        headless: true,
        isolatedProfiles: true,
        http2Enabled: false,
        quicEnabled: false,
      },
      baseline: {
        ...baselineEvidence,
        finalUrl: baselineFinalUrl,
        clickToLoadMs: baselineNavigationMs,
        rawNetLogSha256: sha256(baselineLog),
        cdp: baselineCdp,
        argv: baselineBrowserEvidence.argv,
      },
      protected: {
        ...protectedEvidence,
        finalUrl: releaseExpected
          ? protectedFinalUrl
          : 'chrome-extension://<disposable-demo>/hold.html',
        decision: snapshot.link.decision,
        clickToReleaseRequestMs: releaseExpected
          ? timing.decisionEpochMs - timing.clickEpochMs
          : null,
        clickToDestinationLoadedMs: releaseExpected
          ? destinationLoadedEpochMs! - timing.clickEpochMs
          : null,
        clickToWarningMs: releaseExpected ? null : timing.decisionEpochMs - timing.clickEpochMs,
        releaseTimingDefinition:
          'RELEASING holding-page state precedes the extension release RPC; destinationLoaded uses browser load event. Neither metric is a safety verdict.',
        rulesAfterNavigation,
        releaseState,
        dispatchToDecisionObservedMs,
        bindingReceiptDeltaMs: timing.decisionNodeMs! - timing.clickNodeMs!,
        trustedAutomatedClick: timing.trusted,
        warmStatusBeforeClick: ready,
        inspectionTrigger: snapshot.inspectionTrigger,
        classification: snapshot.link.classification,
        inspectionTiming: snapshot.link.timing,
        cleanupAtDecision: snapshot.link.cleanup,
        session: snapshot.link.session,
        rawNetLogSha256: sha256(protectedLog),
        cdp: protectedCdp,
        argv: protectedBrowserEvidence.argv,
        installedRules: { expectedRuleSha256, installedRuleSha256, rules: installedRules },
      },
      scope:
        'One baseline and one protected ordinary anchor click per owned fixture in disposable Chromium profiles. Successful live zero-findings inspection releases the registered benign URL; findings hold the phishing URL. No findings is not proof of safety. Destination requests are HTTP header sends, not DNS/TCP/TLS contact. This does not establish arbitrary-site support, Safari release, hostile-page containment, or detection accuracy. No Playwright routing or mocked responses.',
      netLogReference:
        'https://chromium.googlesource.com/chromium/src/+/main/net/log/net_log_event_type_list.h',
    };
  } catch (error: unknown) {
    const code =
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : 'DETAILS_WITHHELD';
    const url = diagnosticPage?.url() ?? null;
    let safeUrl: string | null = null;
    if (url) {
      try {
        const parsed = new URL(url);
        safeUrl =
          parsed.protocol === 'chrome-extension:'
            ? 'chrome-extension://<disposable-demo>' + parsed.pathname
            : parsed.origin + parsed.pathname;
      } catch {
        safeUrl = 'UNPARSEABLE';
      }
    }
    let pageState: unknown = null;
    if (diagnosticPage && !diagnosticPage.isClosed()) {
      try {
        pageState = await Promise.race([
          diagnosticPage.evaluate(() => ({
            state: document.body?.dataset.state ?? null,
            classification: document.body?.dataset.classification ?? null,
            readyState: document.readyState,
            hasSourceLink: !!document.querySelector('#fixture-link'),
          })),
          delay(2000, null, { ref: false }),
        ]);
        await diagnosticPage.screenshot({
          path: resolve(output, 'failure.private.png'),
          timeout: 3000,
        });
      } catch {
        /* Preserve all other evidence even if the renderer is unavailable. */
      }
    }
    await writeFile(
      resolve(output, 'failure.json'),
      JSON.stringify(
        {
          status: 'FAIL',
          stage,
          code,
          pageUrl: safeUrl,
          pageState,
          browserErrorCount: browserErrors.length,
          at: new Date().toISOString(),
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
    await writeFile(
      resolve(output, 'failure.private.json'),
      JSON.stringify(
        {
          error:
            error instanceof Error
              ? { name: error.name, message: error.message, stack: error.stack }
              : String(error),
          pageUrl: url,
          browserErrors,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
    throw error;
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    sourcePage.closeAllConnections();
    await new Promise<void>((done) => sourcePage.close(() => done()));
    if (controller) {
      controller.kill('SIGTERM');
      closeCode = await Promise.race([controllerExit!, delay(45_000, null, { ref: false })]);
      // Never SIGKILL a provider owner: preserve its journal and let orderly cleanup finish.
      if (closeCode === null) controller.unref();
      await writeFile(resolve(output, 'controller.private.log'), controllerOutput, { mode: 0o600 });
    }
    process.off('SIGINT', interrupted);
    process.off('SIGTERM', interrupted);
  }
  stage = 'CLEANUP';
  if (!report || closeCode !== 0 || stopping) {
    await writeFile(
      resolve(output, 'incomplete-report.json'),
      JSON.stringify(
        {
          ...(report ?? {}),
          status: 'INCOMPLETE',
          failure: 'CLEANUP_UNRESOLVED',
          controllerExitCode: closeCode,
          stopping,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
    throw new Error('CLEANUP_UNRESOLVED');
  }
  const journal = resolve(output, 'runtime-data/solari-warm-owner.json');
  let journalAbsent = false;
  try {
    await readFile(journal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') journalAbsent = true;
    else throw error;
  }
  if (!journalAbsent) throw new Error('JOURNAL_UNRESOLVED');
  for (const file of sourceFiles) {
    if (sha256(await readFile(resolve(project, file.path))) !== file.sha256)
      throw new Error('SOURCE_CHANGED_DURING_RUN');
  }
  report.controllerShutdown = { exitCode: closeCode, ownershipJournalAbsent: journalAbsent };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', {
    mode: 0o600,
  });
  const protectedReport = report.protected as {
    clickToWarningMs: number;
    destinationRequestsSent: number;
  };
  console.info(
    JSON.stringify({
      status: 'PASS',
      output,
      decision: releaseExpected ? 'RELEASE' : 'BLOCK',
      clickToWarningMs: protectedReport.clickToWarningMs,
      protectedDestinationRequestsSent: protectedReport.destinationRequestsSent,
    }),
  );
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== '--live' || args[1] !== '--output' || !args[2])
    throw new Error('CLI');
  const output = resolve(args[2]);
  if (!output.startsWith(resolve('runtime-data') + sep)) throw new Error('OUTPUT');
  await mkdir(output, { recursive: true, mode: 0o700 });
  const reports = [];
  for (const scenario of scenarios)
    reports.push({
      name: scenario.name,
      report: await runScenario(
        resolve(output, scenario.name),
        scenario.fixture,
        scenario.releaseExpected,
      ),
    });
  await writeFile(
    resolve(output, 'report.json'),
    JSON.stringify(
      { status: 'PASS', capturedAt: new Date().toISOString(), scenarios: reports },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  const csv = [
    'scenario,decision,click_to_release_request_ms,click_to_destination_loaded_ms,click_to_warning_ms,destination_http_requests',
  ];
  for (const item of reports) {
    const row = item.report.protected as Record<string, unknown>;
    csv.push(
      [
        item.name,
        row.decision,
        row.clickToReleaseRequestMs ?? '',
        row.clickToDestinationLoadedMs ?? '',
        row.clickToWarningMs ?? '',
        row.destinationRequestsSent,
      ].join(','),
    );
  }
  await writeFile(resolve(output, 'summary.csv'), csv.join('\n') + '\n', { mode: 0o600 });
}

main().catch((error: unknown) => {
  const code =
    error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'DETAILS_WITHHELD';
  console.error(JSON.stringify({ status: 'FAIL', stage, code }));
  console.error(
    'Controlled click qualification failed. Preserve private runtime-data evidence and reconcile the ownership journal before retrying.',
  );
  process.exitCode = 1;
});
