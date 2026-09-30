import { readConfig } from '../src/server/runtime/config.ts';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { SandboxClient, type Sandbox } from '@solarisdk/sandbox';
import { z } from 'zod';
import { pathToFileURL } from 'node:url';
import { createCorpus, type Expected } from '../fixtures/benchmark/corpus.ts';
import { InspectionObservationSchema } from '../src/contracts/index.ts';
import { detectThreats } from '../src/server/detection/index.ts';
import { BROWSER_VERSION } from '../src/server/isolation/policy.ts';
import { waitForInventoryAbsence } from '../src/server/isolation/solari.ts';

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export interface ScoreRow {
  expected: Expected;
  categories: string[];
  error: string | null;
}
export function summarize(rows: ScoreRow[]) {
  let tp = 0,
    fn = 0,
    fp = 0,
    tn = 0,
    ambiguous = 0,
    errors = 0;
  for (const row of rows) {
    if (row.error) {
      errors++;
      continue;
    }
    if (row.expected === 'AMBIGUOUS') {
      ambiguous++;
      continue;
    }
    const flagged = row.categories.length > 0;
    if (row.expected === 'MALICIOUS') {
      if (flagged) tp++;
      else fn++;
    } else {
      if (flagged) fp++;
      else tn++;
    }
  }
  const ratio = (n: number, d: number) => (d ? n / d : null);
  const intents = ['MALICIOUS', 'BENIGN', 'AMBIGUOUS'] as const;
  const allByExpected = Object.fromEntries(
    intents.map((expected) => [expected, rows.filter((row) => row.expected === expected).length]),
  );
  const errorsByExpected = Object.fromEntries(
    intents.map((expected) => [
      expected,
      rows.filter((row) => row.expected === expected && row.error).length,
    ]),
  );
  return {
    allByExpected,
    errorsByExpected,
    conservativeMaliciousDetectionYield: ratio(tp, allByExpected.MALICIOUS ?? 0),
    tp,
    fn,
    fp,
    tn,
    ambiguous,
    errors,
    evaluatedBinary: tp + fn + fp + tn,
    tpr: ratio(tp, tp + fn),
    fpr: ratio(fp, fp + tn),
    precision: ratio(tp, tp + fp),
    denominatorPolicy:
      'Only successfully extracted non-ambiguous cases; errors are reported separately. Findings are not ALLOW/BLOCK decisions.',
  };
}

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
  const startedAt=new Date().toISOString();
  let context;
  let blockedRequests=0;
  try {
   context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false,offline:true});
   await context.route('**/*', async route => {
    const req=route.request();
    if(req.method()==='GET' && req.isNavigationRequest() && req.url()===fixture.url && fixture.finalUrl!==fixture.url)
      await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><meta http-equiv="refresh" content="0;url='+fixture.finalUrl+'">'});
    else if(req.url()===fixture.finalUrl && req.method()==='GET' && req.isNavigationRequest())
      await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:fixture.html});
    else {blockedRequests++; await route.abort('blockedbyclient');}
   });
   const page=await context.newPage();
   const navigations=[];
   page.on('framenavigated', frame=>{ if(frame===page.mainFrame()) navigations.push(frame.url()); });
   await page.goto(fixture.url,{waitUntil:'domcontentloaded',timeout:3000});
   if(fixture.finalUrl!==fixture.url) await page.waitForURL(fixture.finalUrl,{waitUntil:'domcontentloaded',timeout:3000});
   const redirects=navigations.filter(url=>url!==page.url() && url!=='about:blank');
   const facts=await page.evaluate(pageFacts);
   results.push({id:fixture.id,startedAt,endedAt:new Date().toISOString(),blockedRequests,error:null,observation:{...facts,finalUrl:page.url(),redirects,observedAt:new Date().toISOString()}});
  } catch { results.push({id:fixture.id,startedAt,endedAt:new Date().toISOString(),blockedRequests,error:'CASE_EXTRACTION_FAILED',observation:null}); }
  finally { if(context) await context.close().catch(()=>{}); }
  await writeFile('/vercel/sandbox/fixture-results.json',JSON.stringify(results));
 }
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
  const fixtures = createCorpus();
  const benchmarkSource = await readFile(new URL('./benchmark-corpus.ts', import.meta.url));
  const corpusSource = await readFile(new URL('../fixtures/benchmark/corpus.ts', import.meta.url));
  const inspectorSource = await readFile(
    new URL('../src/server/isolation/solari.ts', import.meta.url),
  );
  const worker = await readFile(
    new URL('../src/server/isolation/worker.mjs', import.meta.url),
    'utf8',
  );
  const detector = await readFile(new URL('../src/server/detection/index.ts', import.meta.url));
  const tag = `aionguard-corpus-${randomUUID()}`;
  const output = `runtime-data/detector-corpus-${new Date().toISOString().replaceAll(':', '-')}`;
  await mkdir(output, { recursive: true, mode: 0o700 });
  await writeFile(`${output}/manifest.json`, JSON.stringify(fixtures, null, 2) + '\n', {
    mode: 0o600,
  });
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
  const cases = fixtures.map((f) => ({
    id: f.id,
    template: f.template,
    group: f.group,
    variant: f.variant,
    expected: f.expected,
    categories: [] as string[],
    error: 'NOT_COMPLETED' as string | null,
    startedAt: null as string | null,
    endedAt: null as string | null,
    blockedRequests: 0,
    observation: null as unknown,
  }));
  const startedAt = new Date().toISOString();
  try {
    console.log(
      'Creating one Solari sandbox for 150 synthetic, script-disabled browser extraction cases.',
    );
    sandbox = await bounded(
      client.create({
        template: 'base',
        cpu: 2,
        memMb: 2048,
        envs: {},
        volumes: [],
        metadata: { application: 'aionguard-corpus', inspection: tag },
        timeoutMs: 600_000,
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
    signal = AbortSignal.timeout(210_000);
    const run = await bounded(
      sandbox.commands.run('node', {
        args: ['/vercel/sandbox/fixture-harness.mjs'],
        env: { PLAYWRIGHT_BROWSERS_PATH: '/vercel/sandbox/ms-playwright' },
        timeoutMs: 190_000,
      }),
      signal,
    );
    if (run.exitCode !== 0) throw new Error('EXTRACTION_FAILED');
    const bytes = await bounded(sandbox.files.read('/vercel/sandbox/fixture-results.json'), signal);
    if (bytes.length > 2_000_000) throw new Error('OVERSIZED_EVIDENCE');
    const results = z
      .array(
        z
          .object({
            id: z.string(),
            startedAt: z.string().datetime(),
            endedAt: z.string().datetime(),
            blockedRequests: z.number().int().nonnegative(),
            error: z.enum(['CASE_EXTRACTION_FAILED']).nullable(),
            observation: InspectionObservationSchema.nullable(),
          })
          .strict(),
      )
      .length(fixtures.length)
      .parse(JSON.parse(Buffer.from(bytes).toString()));
    if (new Set(results.map((r) => r.id)).size !== fixtures.length)
      throw new Error('INVALID_EVIDENCE');
    for (const fixture of fixtures) {
      const extracted = results.find((r) => r.id === fixture.id);
      const row = cases.find((r) => r.id === fixture.id)!;
      if (!extracted) throw new Error('INVALID_EVIDENCE');
      Object.assign(row, extracted);
      if (extracted.error) continue;
      if (
        !extracted.observation ||
        extracted.observation.finalUrl !== fixture.finalUrl ||
        Date.parse(extracted.startedAt) < Date.parse(startedAt) ||
        Date.parse(extracted.endedAt) > Date.now() + 5000
      ) {
        row.error = 'INVALID_OBSERVATION';
        continue;
      }
      row.categories = detectThreats(extracted.observation, [
        'https://trusted.aionguard.invalid',
      ]).map((f) => f.category);
    }
  } catch {
    // Never serialize SDK errors: signed sandbox capabilities can be present in messages.
    failure = 'SYNTHETIC_QUALIFICATION_FAILED';
  } finally {
    if (sandbox) {
      signal = AbortSignal.timeout(30_000);
      try {
        await bounded(sandbox.kill(), signal);
        const absent = await waitForInventoryAbsence(
          () =>
            bounded(
              client.list({
                metadata: { application: 'aionguard-corpus', inspection: tag },
                limit: 100,
              }),
              signal,
            ),
          signal,
        );
        if (absent) cleanup = 'CONFIRMED';
      } catch {
        /* Keep unresolved. Do not expose the raw provider error or sandbox id. */
      }
    }
  }
  const completed = cases.every((c) => !c.error) && cleanup === 'CONFIRMED' && !failure;
  const report = {
    schemaVersion: 1,
    evidenceScope:
      '150 controlled authored scenarios from 30 templates with five correlated surface variants each; not representative web accuracy, held-out validation, or link-release performance.',
    provider: 'SOLARI_SANDBOX',
    inspectionTag: tag,
    sandboxCount: sandbox ? 1 : 0,
    startedAt,
    returnedAt: new Date().toISOString(),
    cleanup,
    failure,
    completed,
    liveWebsiteCoverage: false,
    freshSandboxPerCase: false,
    pageAuthoredScriptsExecuted: false,
    casePageNetworkRequestsAllowed: false,
    astraInvocationStatus: 'NOT_IMPLEMENTED_IN_DETECTOR',
    classificationPolicy:
      'Any heuristic finding is FLAGGED; no finding is UNDETERMINED, never safe or ALLOW.',
    isolationScope:
      'Browser route fulfillment blocks external case-page requests; this does not prove provider egress isolation or host protection. Setup downloads browser packages.',
    timingScope:
      'Case extraction timestamps use one shared sandbox and browser, fresh context per case; these are not nominal click-path latency measurements.',
    attemptedCount:
      failure && cases.every((row) => row.startedAt === null)
        ? null
        : cases.filter((row) => row.startedAt !== null).length,
    attemptedCountPolicy:
      'Null means extraction artifact unavailable; zero attempts cannot be inferred from a provider failure.',
    unfinishedCount: cases.filter((row) => row.error === 'NOT_COMPLETED').length,
    hashes: {
      benchmarkSource: sha256(benchmarkSource),
      worker: sha256(worker),
      inspector: sha256(inspectorSource),
      detector: sha256(detector),
      harness: sha256(harness),
      corpusSource: sha256(corpusSource),
      manifest: sha256(JSON.stringify(fixtures)),
      fixtures: Object.fromEntries(fixtures.map((f) => [f.id, sha256(f.html)])),
    },
    summary: summarize(cases),
    byGroup: Object.fromEntries(
      [...new Set(fixtures.map((f) => f.group))].map((group) => [
        group,
        summarize(cases.filter((c) => c.group === group)),
      ]),
    ),
    cases: cases.map((row) => ({
      ...row,
      classification: row.error
        ? 'INSPECTION_UNAVAILABLE'
        : row.categories.length
          ? 'FLAGGED'
          : 'UNDETERMINED',
      cleanup,
      astraInvocationStatus: 'NOT_IMPLEMENTED_IN_DETECTOR',
    })),
  };
  await writeFile(`${output}/manifest.json`, JSON.stringify(fixtures, null, 2) + '\n', {
    mode: 0o600,
  });
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const columns = [
    'id',
    'template',
    'group',
    'variant',
    'expected',
    'classification',
    'categories',
    'error',
    'startedAt',
    'endedAt',
    'blockedRequests',
    'cleanup',
    'astraInvocationStatus',
  ];
  const csv = (value: unknown) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  await writeFile(
    `${output}/cases.csv`,
    [
      columns.join(','),
      ...cases.map((c) =>
        [
          c.id,
          c.template,
          c.group,
          c.variant,
          c.expected,
          c.error ? 'INSPECTION_UNAVAILABLE' : c.categories.length ? 'FLAGGED' : 'UNDETERMINED',
          c.categories.join('|'),
          c.error,
          c.startedAt,
          c.endedAt,
          c.blockedRequests,
          cleanup,
          'NOT_IMPLEMENTED_IN_DETECTOR',
        ]
          .map(csv)
          .join(','),
      ),
    ].join('\n') + '\n',
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ output, completed, cleanup, failure, summary: report.summary }));
  if (!completed) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch(() => {
    console.error('Controlled corpus benchmark failed; provider details withheld.');
    process.exitCode = 1;
  });
}
