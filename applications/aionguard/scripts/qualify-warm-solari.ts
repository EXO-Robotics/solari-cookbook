import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { readConfig } from '../src/server/runtime/config.ts';
import { detectThreats } from '../src/server/detection/index.ts';
import { registeredFixture } from '../src/server/isolation/policy.ts';
import { solariConfigFromEnv, type WorkerTiming } from '../src/server/isolation/solari.ts';
import { journaledSolariProvider } from '../src/server/isolation/warm-journal.ts';
import { WarmSolariInspector, type WarmPoolStatus } from '../src/server/isolation/warm-solari.ts';
import type { InspectionResult } from '../src/contracts/index.ts';

type Event = {
  phase: string;
  event: string;
  at: string;
  elapsedMs: number;
  workerTiming?: WorkerTiming;
};
type Run = {
  phase: 'CALIBRATED_REUSE' | 'FLAGGED_RETIREMENT';
  index: number;
  startedAt: string;
  elapsedMs: number;
  sandboxId: string | null;
  execution: InspectionResult['execution'];
  failure: InspectionResult['failure'];
  findings: string[];
  expectedFindings: 'NONE_BY_CONTROLLED_TRUST_CALIBRATION' | 'CREDENTIAL_PHISHING';
  cleanup: InspectionResult['cleanup'];
  session: InspectionResult['session'];
  stagesMs: Record<string, number | null>;
  events: Event[];
};

async function main() {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();
  let live = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--live' && !live) {
      live = true;
      continue;
    }
    if (
      !['--runs', '--output'].includes(arg) ||
      options.has(arg) ||
      !args[i + 1] ||
      args[i + 1]!.startsWith('--')
    )
      throw new Error('CLI');
    options.set(arg, args[++i]!);
  }
  const count = Number(options.get('--runs') ?? '10');
  if (!live || ![10, 20].includes(count)) throw new Error('CLI');
  readConfig();
  const config = solariConfigFromEnv(process.env);
  if (!config) throw new Error('CONFIG');
  // This qualification is deliberately tied to the recorded inert demonstration.
  // Trust calibration changes ONLY this process's config; it is not a benign dataset.
  const target = 'https://mfrey18.github.io/AionPhish/';
  if (
    config.fixture.url !== target ||
    config.fixture.identityProviderOrigins.includes(new URL(target).origin)
  )
    throw new Error('FIXTURE');
  const calibratedConfig = {
    ...config,
    fixture: registeredFixture(target, [new URL(target).origin], 'url'),
  };
  const root = resolve('runtime-data');
  const output = resolve(
    options.get('--output') ??
      `runtime-data/warm-solari-${new Date().toISOString().replaceAll(':', '-')}`,
  );
  if (!output.startsWith(root + sep)) throw new Error('OUTPUT');
  await mkdir(output, { recursive: true, mode: 0o700 });
  await writeFile(`${output}/runs.jsonl`, '', { flag: 'wx', mode: 0o600 });
  const journal = `${output}/reservation.json`;
  const events: Event[] = [],
    runs: Run[] = [];
  const start = performance.now();
  let phase = 'PREWARM_REUSE';
  let interrupted = false;
  let failure: string | null = null;
  let replacementVerified = false;
  let reuseId: string | null = null;
  let replacementId: string | null = null;
  const observer = (event: string, workerTiming?: WorkerTiming) => {
    events.push({
      phase,
      event,
      at: new Date().toISOString(),
      elapsedMs: performance.now() - start,
      ...(workerTiming ? { workerTiming } : {}),
    });
  };
  const provider = journaledSolariProvider(journal);
  const reusePool = new WarmSolariInspector(calibratedConfig, provider, { observer });
  const flagPool = new WarmSolariInspector(config, provider, { observer });
  const pools = [reusePool, flagPool];
  const stop = () => {
    interrupted = true;
    for (const pool of pools) void pool.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const checkpoints: { phase: string; at: string; status: WarmPoolStatus }[] = [];
  const checkpoint = (pool: WarmSolariInspector) =>
    checkpoints.push({ phase, at: new Date().toISOString(), status: pool.status() });
  const ensureRunning = () => {
    if (interrupted) throw new Error('INTERRUPTED');
  };
  async function inspect(
    pool: WarmSolariInspector,
    kind: Run['phase'],
    index: number,
  ): Promise<Run> {
    ensureRunning();
    phase = `${kind}_${index}`;
    const offset = events.length,
      started = performance.now(),
      startedAt = new Date().toISOString();
    const result = await pool.inspect('acme-login');
    const elapsedMs = performance.now() - started;
    const findings = result.observation
      ? detectThreats(
          result.observation,
          kind === 'CALIBRATED_REUSE'
            ? calibratedConfig.fixture.identityProviderOrigins
            : config!.fixture.identityProviderOrigins,
        ).map((f) => f.category)
      : [];
    const ownEvents = events.slice(offset).filter((e) => e.phase === phase);
    const between = (a: string, b: string): number | null => {
      const first = ownEvents.find((e) => e.event === a),
        last = ownEvents.find((e) => e.event === b);
      return first && last ? last.elapsedMs - first.elapsedMs : null;
    };
    const worker = ownEvents.find((e) => e.event === 'worker_timing')?.workerTiming?.events;
    const row: Run = {
      phase: kind,
      index,
      startedAt,
      elapsedMs,
      sandboxId: result.sandboxId,
      execution: result.execution,
      failure: result.failure,
      findings,
      expectedFindings:
        kind === 'CALIBRATED_REUSE'
          ? 'NONE_BY_CONTROLLED_TRUST_CALIBRATION'
          : 'CREDENTIAL_PHISHING',
      cleanup: result.cleanup,
      session: result.session,
      stagesMs: {
        collectionAndTransfer: between('collection_started', 'evidence_received'),
        validation: between('evidence_received', 'evidence_validated'),
        decisionAfterValidation: between('evidence_validated', 'inspection_returned'),
        workerBrowserLaunch: worker ? worker.browserReady - worker.workerStarted : null,
        workerNavigation: worker ? worker.pageLoaded - worker.navigationStarted : null,
        workerFacts: worker ? worker.factsCollected - worker.pageLoaded : null,
        workerScreenshot: worker ? worker.screenshotCollected - worker.factsCollected : null,
      },
      events: ownEvents,
    };
    runs.push(row);
    await appendFile(`${output}/runs.jsonl`, JSON.stringify(row) + '\n', { mode: 0o600 });
    console.log(
      JSON.stringify({
        phase: kind,
        index,
        elapsedMs: Math.round(elapsedMs),
        execution: result.execution,
        cleanup: result.cleanup.state,
        findings,
        reused: result.session?.reused ?? false,
      }),
    );
    checkpoint(pool);
    return row;
  }
  try {
    console.log('Preparing browser before measured clicks; setup can take about 35 seconds.');
    await reusePool.prepare();
    ensureRunning();
    checkpoint(reusePool);
    if (reusePool.status().state !== 'READY' || reusePool.status().inspectionCount !== 0)
      throw new Error('PREWARM');
    reuseId = reusePool.status().sandboxId;
    for (let index = 1; index <= count; index++) {
      const row = await inspect(reusePool, 'CALIBRATED_REUSE', index);
      if (
        row.execution !== 'SUCCEEDED' ||
        row.findings.length ||
        row.cleanup.state !== 'RETAINED' ||
        row.sandboxId !== reuseId ||
        row.session?.reused !== index > 1
      )
        throw new Error('REUSE');
    }
    phase = 'CLOSE_REUSE';
    await reusePool.close();
    checkpoint(reusePool);
    if (reusePool.status().cleanupUnresolved) throw new Error('CLEANUP');
    ensureRunning();
    phase = 'PREWARM_FLAGGED';
    console.log('Preparing separate pool with original trust policy for flag-and-replace check.');
    await flagPool.prepare();
    checkpoint(flagPool);
    ensureRunning();
    if (flagPool.status().state !== 'READY') throw new Error('PREWARM');
    const flagged = await inspect(flagPool, 'FLAGGED_RETIREMENT', 1);
    if (
      flagged.execution !== 'SUCCEEDED' ||
      !flagged.findings.includes('CREDENTIAL_PHISHING') ||
      flagged.session?.disposition !== 'RETIRED' ||
      flagged.cleanup.state !== 'PENDING'
    )
      throw new Error('FLAG');
    phase = 'REPLACEMENT';
    const deadline = performance.now() + 240_000;
    let nextProgress = performance.now() + 10_000;
    while (performance.now() < deadline) {
      ensureRunning();
      const state = flagPool.status();
      if (state.state === 'BLOCKED' || state.state === 'EMPTY' || state.state === 'CLOSED')
        throw new Error('REPLACEMENT');
      if (state.state === 'READY') {
        replacementId = state.sandboxId;
        replacementVerified =
          replacementId !== null &&
          replacementId !== flagged.sandboxId &&
          state.inspectionCount === 0;
        break;
      }
      if (performance.now() >= nextProgress) {
        console.log(JSON.stringify({ phase, state: state.state }));
        nextProgress += 10_000;
      }
      await delay(250);
    }
    checkpoint(flagPool);
    if (!replacementVerified) throw new Error('REPLACEMENT');
  } catch (error) {
    const allowed = ['INTERRUPTED', 'PREWARM', 'REUSE', 'CLEANUP', 'FLAG', 'REPLACEMENT'];
    failure =
      error instanceof Error && allowed.includes(error.message)
        ? error.message
        : 'QUALIFICATION_ERROR';
  } finally {
    phase = 'SHUTDOWN';
    await Promise.all(
      pools.map(async (pool) => {
        try {
          await pool.close();
        } catch {
          failure ??= 'SHUTDOWN';
        }
        checkpoint(pool);
      }),
    );
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    let reservationRemains = true;
    try {
      await stat(journal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') reservationRemains = false;
    }
    const cleanupUnresolved = pools.reduce((sum, pool) => sum + pool.status().cleanupUnresolved, 0);
    if (cleanupUnresolved || reservationRemains) failure ??= 'CLEANUP';
    const hashes = Object.fromEntries(
      await Promise.all(
        [
          '../src/server/isolation/worker.mjs',
          '../src/server/isolation/warm-solari.ts',
          '../src/server/isolation/solari.ts',
          '../src/server/isolation/warm-journal.ts',
          '../src/server/detection/index.ts',
        ].map(async (file) => [
          file.split('/').pop()!,
          createHash('sha256')
            .update(await readFile(new URL(file, import.meta.url)))
            .digest('hex'),
        ]),
      ),
    );
    const measured = runs
      .filter((run) => run.phase === 'CALIBRATED_REUSE')
      .map((run) => run.elapsedMs)
      .sort((a, b) => a - b);
    const percentile = (p: number) =>
      measured.length ? measured[Math.max(0, Math.ceil(measured.length * p) - 1)] : null;
    const report = {
      schemaVersion: 1,
      completedAt: new Date().toISOString(),
      failure,
      requestedReuseChecks: count,
      completedReuseChecks: measured.length,
      reuseId,
      replacementId,
      replacementVerified,
      originalTrustedOrigins: config.fixture.identityProviderOrigins,
      calibrationTrustedOrigins: calibratedConfig.fixture.identityProviderOrigins,
      interpretation:
        'Owned AionPhish fixture only. Reuse calibration trusts its actual origin to suppress the credential heuristic intentionally. This proves lifecycle and hot-path latency, not benign accuracy, detection rates, safe release, host containment, or universal VM compatibility.',
      timingBoundary:
        'Backend inspect() entry to returned validated result, after explicit prewarming; excludes user click interception and asynchronous retirement. Worker spans use a separate guest monotonic clock.',
      reuseLatencyMs: { median: percentile(0.5), p90: percentile(0.9), p95: percentile(0.95) },
      cleanup: {
        cleanupUnresolved,
        reservationRemains,
        meaning:
          'Control-plane termination and inventory reconciliation only; not physical isolation or erasure proof.',
      },
      astraInvoked: false,
      navigationReleased: false,
      hashes,
      runs,
      checkpoints,
      events,
    };
    await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n', {
      mode: 0o600,
    });
    const columns = [
      'phase',
      'index',
      'startedAt',
      'elapsedMs',
      'sandboxId',
      'execution',
      'failure',
      'findings',
      'expectedFindings',
      'cleanupState',
      'reused',
      'inspectionCount',
      'disposition',
      'collectionAndTransferMs',
      'validationMs',
      'decisionAfterValidationMs',
      'workerBrowserLaunchMs',
      'workerNavigationMs',
      'workerFactsMs',
      'workerScreenshotMs',
    ];
    const csv =
      [
        columns,
        ...runs.map((run) => [
          run.phase,
          run.index,
          run.startedAt,
          run.elapsedMs,
          run.sandboxId,
          run.execution,
          run.failure,
          run.findings.join('|'),
          run.expectedFindings,
          run.cleanup.state,
          run.session?.reused,
          run.session?.inspectionCount,
          run.session?.disposition,
          ...[
            'collectionAndTransfer',
            'validation',
            'decisionAfterValidation',
            'workerBrowserLaunch',
            'workerNavigation',
            'workerFacts',
            'workerScreenshot',
          ].map((key) => run.stagesMs[key]),
        ]),
      ]
        .map((row) => row.map((value) => JSON.stringify(String(value ?? ''))).join(','))
        .join('\n') + '\n';
    await writeFile(`${output}/runs.csv`, csv, { mode: 0o600 });
    console.log(
      JSON.stringify({
        output,
        failure,
        completedReuseChecks: measured.length,
        replacementVerified,
        cleanupUnresolved,
        reservationRemains,
        reuseLatencyMs: report.reuseLatencyMs,
      }),
    );
    if (failure) process.exitCode = 1;
  }
}
await main().catch(() => {
  console.error(
    'Warm qualification could not start. Require --live --runs 10|20, private Solari config, the owned AionPhish fixture, and a fresh runtime-data output directory.',
  );
  process.exitCode = 1;
});
