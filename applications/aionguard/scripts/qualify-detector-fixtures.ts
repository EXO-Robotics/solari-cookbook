import { readConfig } from '../src/server/runtime/config.ts';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { SandboxClient, type Sandbox } from '@solarisdk/sandbox';
import { z } from 'zod';
import { InspectionObservationSchema } from '../src/contracts/index.ts';
import { detectThreats, THREAT_CATEGORIES } from '../src/server/detection/index.ts';
import { BROWSER_VERSION } from '../src/server/isolation/policy.ts';

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const ManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceScope: z.string(),
    approvedIdpOrigins: z.array(z.literal('https://trusted.aionguard.invalid')).length(1),
    fixtures: z
      .array(
        z
          .object({
            name: z.string().regex(/^[a-z-]+$/),
            file: z.string().regex(/^[a-z-]+\.html$/),
            url: z.string().regex(/^https:\/\/owned\.aionguard\.invalid\/[a-z-]+\.html$/),
            expected: z.array(z.enum(THREAT_CATEGORIES)),
          })
          .strict(),
      )
      .length(6),
  })
  .strict();

// Trusted harness: uploaded static HTML is fulfilled locally, never fetched from a website.
const harness = `
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '/vercel/sandbox/node_modules/playwright/index.mjs';
import { pageFacts } from '/vercel/sandbox/aionguard-worker.mjs';
const fixtures = JSON.parse(await readFile('/vercel/sandbox/fixtures.json', 'utf8'));
const browser = await chromium.launch({headless:true, timeout:15000});
const results=[];
try {
 for (const fixture of fixtures) {
  const context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false});
  try {
   await context.route('**/*', async route => {
    const req=route.request();
    if(req.url()===fixture.url && req.method()==='GET' && req.isNavigationRequest())
      await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:fixture.html});
    else await route.abort('blockedbyclient');
   });
   const page=await context.newPage();
   await page.goto(fixture.url,{waitUntil:'domcontentloaded',timeout:10000});
   const facts=await page.evaluate(pageFacts);
   results.push({name:fixture.name,observation:{...facts,finalUrl:page.url(),redirects:[],observedAt:new Date().toISOString()}});
  } finally {await context.close();}
 }
 await writeFile('/vercel/sandbox/fixture-results.json',JSON.stringify(results));
} finally {await browser.close();}
`;

async function bounded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort: (() => void) | undefined;
  try {
    signal.throwIfAborted();
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error('DEADLINE_EXCEEDED'));
        signal.addEventListener('abort', onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}
async function main() {
  if (!process.argv.includes('--live')) {
    console.error(
      'Pass --live to run synthetic extraction qualification in one billed Solari sandbox.',
    );
    process.exitCode = 1;
    return;
  }
  readConfig();
  if (
    !process.env.SOLARI_API_KEY ||
    (process.env.SOLARI_BASE_URL && process.env.SOLARI_BASE_URL !== 'https://api.getsolari.com')
  ) {
    console.error('Solari credentials and the official API endpoint are required.');
    process.exitCode = 1;
    return;
  }
  const manifestBytes = await readFile(
    new URL('../fixtures/detector/manifest.json', import.meta.url),
  );
  const manifest = ManifestSchema.parse(JSON.parse(manifestBytes.toString()));
  if (
    new Set(manifest.fixtures.map((f) => f.name)).size !== 6 ||
    new Set(manifest.fixtures.map((f) => f.url)).size !== 6
  )
    throw new Error('INVALID_MANIFEST');
  const fixtures = await Promise.all(
    manifest.fixtures.map(async (f) => ({
      ...f,
      html: await readFile(new URL(`../fixtures/detector/${f.file}`, import.meta.url), 'utf8'),
    })),
  );
  const worker = await readFile(
    new URL('../src/server/isolation/worker.mjs', import.meta.url),
    'utf8',
  );
  const detector = await readFile(new URL('../src/server/detection/index.ts', import.meta.url));
  const tag = `aionguard-fixtures-${randomUUID()}`;
  const output = `runtime-data/detector-fixtures-${new Date().toISOString().replaceAll(':', '-')}`;
  await mkdir(output, { recursive: true, mode: 0o700 });
  let signal = AbortSignal.timeout(30_000);
  const client = new SandboxClient({
    apiKey: process.env.SOLARI_API_KEY,
    baseUrl: 'https://api.getsolari.com',
    callTimeoutMs: 240_000,
    fetch: (input, init) => {
      signal.throwIfAborted();
      return fetch(input, {
        ...init,
        signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]),
      });
    },
  });
  let sandbox: Sandbox | undefined;
  let cleanup = 'UNRESOLVED',
    failure: string | null = null;
  const cases: {
    name: string;
    expected: string[];
    categories: string[];
    pass: boolean;
    observation: unknown;
  }[] = [];
  const startedAt = new Date().toISOString();
  try {
    console.log(
      'Creating one Solari sandbox for six synthetic, script-disabled browser extraction cases.',
    );
    sandbox = await bounded(
      client.create({
        template: 'base',
        cpu: 2,
        memMb: 2048,
        envs: {},
        volumes: [],
        metadata: { application: 'aionguard-fixtures', inspection: tag },
        timeoutMs: 300_000,
        lifecycle: { onTimeout: 'kill' },
      }),
      signal,
    );
    signal = AbortSignal.timeout(240_000);
    const setup = await bounded(
      sandbox.commands.run('sh', {
        args: [
          '-c',
          `mkdir -p /vercel/sandbox && cd /vercel/sandbox && npm install --no-audit --no-fund --ignore-scripts --save-exact playwright@${BROWSER_VERSION} && PLAYWRIGHT_BROWSERS_PATH=/vercel/sandbox/ms-playwright npx playwright install --with-deps chromium`,
        ],
        timeoutMs: 210_000,
      }),
      signal,
    );
    if (setup.exitCode !== 0) throw new Error('SETUP_FAILED');
    await bounded(sandbox.connect(), signal);
    for (const [path, content] of [
      ['aionguard-worker.mjs', worker],
      ['fixture-harness.mjs', harness],
      ['fixtures.json', JSON.stringify(fixtures)],
    ])
      await bounded(sandbox.files.write(`/vercel/sandbox/${path}`, content!), signal);
    signal = AbortSignal.timeout(90_000);
    const run = await bounded(
      sandbox.commands.run('node', {
        args: ['/vercel/sandbox/fixture-harness.mjs'],
        env: { PLAYWRIGHT_BROWSERS_PATH: '/vercel/sandbox/ms-playwright' },
        timeoutMs: 75_000,
      }),
      signal,
    );
    if (run.exitCode !== 0) throw new Error('EXTRACTION_FAILED');
    const bytes = await bounded(sandbox.files.read('/vercel/sandbox/fixture-results.json'), signal);
    if (bytes.length > 100_000) throw new Error('OVERSIZED_EVIDENCE');
    const results = z
      .array(z.object({ name: z.string(), observation: InspectionObservationSchema }).strict())
      .length(6)
      .parse(JSON.parse(Buffer.from(bytes).toString()));
    if (new Set(results.map((r) => r.name)).size !== 6) throw new Error('INVALID_EVIDENCE');
    for (const fixture of manifest.fixtures) {
      const row = results.find((r) => r.name === fixture.name);
      if (
        !row ||
        row.observation.finalUrl !== fixture.url ||
        row.observation.redirects.length ||
        Date.parse(row.observation.observedAt) < Date.parse(startedAt) ||
        Date.parse(row.observation.observedAt) > Date.now() + 5000
      )
        throw new Error('INVALID_EVIDENCE');
      const categories = detectThreats(row.observation, manifest.approvedIdpOrigins).map(
        (f) => f.category,
      );
      cases.push({
        name: fixture.name,
        expected: fixture.expected,
        categories,
        pass: JSON.stringify(categories) === JSON.stringify(fixture.expected),
        observation: row.observation,
      });
    }
  } catch {
    // Never serialize SDK errors: signed sandbox capabilities can be present in messages.
    failure = 'SYNTHETIC_QUALIFICATION_FAILED';
  } finally {
    if (sandbox) {
      signal = AbortSignal.timeout(30_000);
      try {
        await bounded(sandbox.kill(), signal);
        const list = await bounded(
          client.list({
            metadata: { application: 'aionguard-fixtures', inspection: tag },
            limit: 100,
          }),
          signal,
        );
        if (list.sandboxes.length === 0 && !list.nextCursor) cleanup = 'CONFIRMED';
      } catch {
        /* Keep unresolved. Do not expose the raw provider error or sandbox id. */
      }
    }
  }
  const passed =
    cases.length === 6 && cases.every((c) => c.pass) && cleanup === 'CONFIRMED' && failure === null;
  const report = {
    schemaVersion: 1,
    evidenceScope: manifest.evidenceScope,
    provider: 'SOLARI_SANDBOX',
    inspectionTag: tag,
    sandboxCount: 1,
    startedAt,
    returnedAt: new Date().toISOString(),
    cleanup,
    failure,
    passed,
    liveWebsiteCoverage: false,
    freshSandboxPerCase: false,
    pageAuthoredScriptsExecuted: false,
    casePageNetworkRequestsAllowed: false,
    hashes: {
      worker: sha256(worker),
      detector: sha256(detector),
      harness: sha256(harness),
      manifest: sha256(manifestBytes),
      fixtures: Object.fromEntries(fixtures.map((f) => [f.file, sha256(f.html)])),
    },
    cases,
  };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(
    JSON.stringify({
      output,
      passed,
      cleanup,
      failure,
      cases: cases.map(({ name, expected, categories, pass }) => ({
        name,
        expected,
        categories,
        pass,
      })),
    }),
  );
  if (!passed) process.exitCode = 1;
}
await main().catch(() => {
  console.error(
    'Synthetic fixture qualification failed before a report could be completed; provider details withheld.',
  );
  process.exitCode = 1;
});
