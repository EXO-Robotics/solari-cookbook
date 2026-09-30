import { appendFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { readConfig } from '../src/server/runtime/config.ts';
import {
  SolariInspector,
  solariConfigFromEnv,
  type WorkerTiming,
} from '../src/server/isolation/solari.ts';
import { detectThreats, THREAT_CATEGORIES } from '../src/server/detection/index.ts';
import {
  interval,
  runsCsv,
  summarize,
  type BenchmarkRun,
  type Stamp,
} from './benchmark-metrics.ts';

async function main() {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();
  let live = false;
  for (let i = 0; i < args.length; i++) {
    const name = args[i]!;
    if (name === '--live' && !live) {
      live = true;
      continue;
    }
    if (
      !['--runs', '--output', '--expected-category'].includes(name) ||
      options.has(name) ||
      !args[i + 1] ||
      args[i + 1]!.startsWith('--')
    )
      throw new Error('CLI');
    options.set(name, args[++i]!);
  }
  const countText = options.get('--runs') ?? '50';
  const requested = Number(countText);
  const expectedCategory = options.get('--expected-category');
  if (
    !live ||
    !/^\d+$/.test(countText) ||
    requested < 1 ||
    requested > 100 ||
    !expectedCategory ||
    ![...THREAT_CATEGORIES, 'NONE'].includes(expectedCategory)
  )
    throw new Error('CLI');
  readConfig();
  const config = solariConfigFromEnv(process.env);
  if (!config) throw new Error('CONFIG');
  const output = resolve(
    options.get('--output') ??
      `runtime-data/benchmark-solari-${new Date().toISOString().replaceAll(':', '-')}`,
  );
  await mkdir(output, { recursive: true, mode: 0o700 });
  // Refuse to overwrite or mingle an existing benchmark's checkpoint stream.
  await writeFile(`${output}/runs.jsonl`, '', { flag: 'wx', mode: 0o600 });
  const hashes = Object.fromEntries(
    await Promise.all(
      [
        'src/server/isolation/worker.mjs',
        'src/server/detection/index.ts',
        'src/server/isolation/solari.ts',
        'scripts/benchmark-solari.ts',
        'scripts/benchmark-metrics.ts',
      ].map(async (file) => [
        file,
        createHash('sha256')
          .update(await readFile(new URL(`../${file}`, import.meta.url)))
          .digest('hex'),
      ]),
    ),
  );
  let sourceCommit: string | null = null;
  let sourceDirty: boolean | null = null;
  try {
    sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    sourceDirty =
      execFileSync('git', ['status', '--porcelain'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim().length > 0;
  } catch {
    /* Source archives may have no Git metadata. */
  }
  const metadata = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    requested,
    expectedCategory,
    sourceCommit,
    sourceDirty,
    hashes,
    scope:
      'Sequential cold fresh Solari sandbox inspections of one configured owned fixture; backend harness timings, not click-to-navigation latency.',
    fixtureUrlSha256: createHash('sha256').update(config.fixture.url).digest('hex'),
    astraInvoked: false,
    astraMeasured: false,
    endpointInterceptionVerified: false,
    hostIsolationVerified: false,
    limitations: [
      'No ALLOW decision is produced.',
      'Observer event serialization and synchronous checkpoint I/O add host measurement overhead; worker timing payload serialization adds guest overhead.',
      'Rules execute after inspection returns and cleanup completes.',
      'Browser setup includes dependency installation on each fresh sandbox.',
      'Guest stage intervals use guest monotonic offsets only; host and guest clocks are never subtracted.',
      'A repeated fixture is not a detection-rate dataset.',
      'Observation hashes normalize observedAt to null so content drift can be compared across repeated runs.',
      'Partial stage durations remain measured even on failed runs; backendDecision is measured only for usable successful evidence.',
    ],
  };
  await writeFile(`${output}/metadata.json`, JSON.stringify(metadata, null, 2) + '\n', {
    mode: 0o600,
  });
  const runs: BenchmarkRun[] = [];
  let stopReason: string | null = null;
  let unavailableStreak = 0;
  let inProgressAttempt: { run: number; startedAt: string; expectedCategory: string } | null = null;
  const save = async () => {
    await writeFile(
      `${output}/results.json.tmp`,
      JSON.stringify(
        {
          ...metadata,
          stopReason,
          inProgressAttempt,
          summary: summarize(runs, requested, inProgressAttempt ? 1 : 0),
          runs,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
    await rename(`${output}/results.json.tmp`, `${output}/results.json`);
    await writeFile(`${output}/results.csv`, runsCsv(runs), { mode: 0o600 });
  };
  for (let index = 1; index <= requested; index++) {
    const origin = performance.now();
    const timestamps: Record<string, Stamp> = {};
    let workerTiming: WorkerTiming | null = null;
    const stamp = (event: string, detail?: WorkerTiming) => {
      if (event === 'worker_timing' && detail) workerTiming = detail;
      const value = { iso: new Date().toISOString(), elapsedMs: performance.now() - origin };
      timestamps[event] = value;
      appendFileSync(
        `${output}/runs.jsonl`,
        JSON.stringify({
          type: 'event',
          run: index,
          event,
          ...value,
          ...(detail ? { workerTiming: detail } : {}),
        }) + '\n',
      );
    };
    stamp('attempt_started');
    inProgressAttempt = {
      run: index,
      startedAt: timestamps.attempt_started!.iso,
      expectedCategory,
    };
    await save();
    const row: BenchmarkRun = {
      run: index,
      expectedCategory,
      classification: 'INSPECTION_UNAVAILABLE',
      categories: [],
      expectedCategoryMatched: null,
      execution: 'UNAVAILABLE',
      cleanup: 'UNRESOLVED',
      error: null,
      timestamps,
      durationsMs: {},
      astraInvoked: false,
      astraStatus: 'NOT_INVOKED',
    };
    try {
      const inspector = new SolariInspector(config, undefined, stamp);
      const result = await inspector.inspect('acme-login');
      row.execution = result.execution;
      row.cleanup = result.cleanup.state;
      row.lifecycle = {
        sandboxId: result.sandboxId,
        stoppedAt: result.cleanup.stoppedAt,
        deletedAt: result.cleanup.deletedAt,
      };
      row.error = result.failure;
      if (result.execution === 'SUCCEEDED' && result.observation) {
        row.observationSha256 = createHash('sha256')
          .update(JSON.stringify({ ...result.observation, observedAt: null }))
          .digest('hex');
        row.screenshotSha256 = result.pngBase64
          ? createHash('sha256').update(Buffer.from(result.pngBase64, 'base64')).digest('hex')
          : null;
        stamp('rules_started');
        row.categories = detectThreats(
          result.observation,
          config.fixture.identityProviderOrigins,
        ).map((finding) => finding.category);
        stamp('rules_complete');
        row.classification = row.categories.length ? 'SUSPICIOUS' : 'UNDETERMINED';
        row.expectedCategoryMatched =
          expectedCategory === 'NONE'
            ? row.categories.length === 0
            : row.categories.includes(expectedCategory);
        stamp('decision_returned');
      }
    } catch {
      row.error = 'HARNESS_EXCEPTION';
    }
    stamp('attempt_complete');
    row.workerTiming = workerTiming;
    const guest = (start: string, end: string): number | null => {
      const events = (row.workerTiming as WorkerTiming | null)?.events as
        Record<string, number> | undefined;
      const a = events?.[start];
      const b = events?.[end];
      return a === undefined || b === undefined || b < a ? null : b - a;
    };
    row.durationsMs = {
      provisioning: interval(timestamps, 'provision_started', 'provision_complete'),
      browserSetup: interval(timestamps, 'setup_started', 'setup_complete'),
      collectionAndTransfer: interval(timestamps, 'collection_started', 'evidence_received'),
      evidenceValidation: interval(timestamps, 'evidence_received', 'evidence_validated'),
      cleanup: interval(timestamps, 'cleanup_started', 'cleanup_complete'),
      rules: interval(timestamps, 'rules_started', 'rules_complete'),
      backendDecision:
        row.execution === 'SUCCEEDED' &&
        row.cleanup === 'CONFIRMED' &&
        row.classification !== 'INSPECTION_UNAVAILABLE'
          ? interval(timestamps, 'attempt_started', 'decision_returned')
          : null,
      totalAttempt: interval(timestamps, 'attempt_started', 'attempt_complete'),
      guestBrowserLaunch: guest('workerStarted', 'browserReady'),
      guestContextSetup: guest('browserReady', 'navigationStarted'),
      pageLoad: guest('navigationStarted', 'pageLoaded'),
      observation: guest('pageLoaded', 'factsCollected'),
      guestScreenshot: guest('factsCollected', 'screenshotCollected'),
      clickToDecision: null,
      astraReview: null,
      totalDeepReview: null,
    };
    runs.push(row);
    inProgressAttempt = null;
    appendFileSync(`${output}/runs.jsonl`, JSON.stringify({ type: 'result', ...row }) + '\n');
    unavailableStreak = row.classification === 'INSPECTION_UNAVAILABLE' ? unavailableStreak + 1 : 0;
    if (!['NOT_CREATED', 'CONFIRMED'].includes(row.cleanup)) stopReason = 'UNRESOLVED_CLEANUP';
    else if (unavailableStreak >= 3) stopReason = 'THREE_CONSECUTIVE_UNAVAILABLE';
    await save();
    console.log(
      JSON.stringify({
        run: index,
        requested,
        classification: row.classification,
        cleanup: row.cleanup,
        backendDecisionMs: row.durationsMs.backendDecision,
        stopReason,
      }),
    );
    if (stopReason) break;
  }
  console.log(JSON.stringify({ output, stopReason, summary: summarize(runs, requested) }));
  if (
    stopReason ||
    runs.some(
      (run) =>
        run.classification === 'INSPECTION_UNAVAILABLE' || run.expectedCategoryMatched === false,
    )
  )
    process.exitCode = 1;
}

main().catch(() => {
  // Config and SDK error strings can include credentials or signed capabilities.
  console.error(
    'Benchmark could not start or persist results. Usage: --live --expected-category CATEGORY|NONE [--runs 1..100] [--output DIR]. Check local configuration and output permissions. Raw errors are suppressed.',
  );
  process.exitCode = 1;
});
