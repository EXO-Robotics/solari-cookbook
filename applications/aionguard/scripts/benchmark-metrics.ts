export interface Stamp {
  iso: string;
  elapsedMs: number;
}
export interface BenchmarkRun {
  run: number;
  expectedCategory: string;
  classification: 'SUSPICIOUS' | 'UNDETERMINED' | 'INSPECTION_UNAVAILABLE';
  categories: string[];
  expectedCategoryMatched: boolean | null;
  execution: string;
  cleanup: string;
  lifecycle?: { sandboxId: string | null; stoppedAt: string | null; deletedAt: string | null };
  error: string | null;
  timestamps: Record<string, Stamp>;
  durationsMs: Record<string, number | null>;
  observationSha256?: string | null;
  screenshotSha256?: string | null;
  workerTiming?: { startedAt: string; events: Record<string, number> } | null;
  astraInvoked: false;
  astraStatus: 'NOT_INVOKED';
}

/** Nearest-rank percentiles; absent samples are not zero-latency successes. */
export function percentile(values: readonly (number | null)[], fraction: number): number | null {
  if (!(fraction > 0 && fraction <= 1)) throw new Error('Percentile must be in (0, 1].');
  const sorted = values
    .filter((v): v is number => v !== null && Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);
  return sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1]! : null;
}

export function interval(stamps: Record<string, Stamp>, start: string, end: string): number | null {
  const a = stamps[start]?.elapsedMs;
  const b = stamps[end]?.elapsedMs;
  return a === undefined || b === undefined || b < a ? null : b - a;
}

export function summarize(runs: readonly BenchmarkRun[], requested: number, incomplete = 0) {
  const durations = [...new Set(runs.flatMap((run) => Object.keys(run.durationsMs)))];
  const successful = runs.filter(
    (run) =>
      run.execution === 'SUCCEEDED' &&
      run.cleanup === 'CONFIRMED' &&
      run.classification !== 'INSPECTION_UNAVAILABLE',
  );
  const distributions = (population: readonly BenchmarkRun[], missingAttempts: number) =>
    Object.fromEntries(
      durations.map((name) => {
        const values = population.map((run) => run.durationsMs[name] ?? null);
        const measured = values.filter(
          (value) => value !== null && Number.isFinite(value) && value >= 0,
        ).length;
        return [
          name,
          {
            measured,
            missing: population.length + missingAttempts - measured,
            medianMs: percentile(values, 0.5),
            p90Ms: percentile(values, 0.9),
            p95Ms: percentile(values, 0.95),
          },
        ];
      }),
    );
  return {
    requested,
    attempted: runs.length + incomplete,
    completed: runs.length,
    incomplete,
    notAttempted: requested - runs.length - incomplete,
    succeeded: successful.length,
    unavailable: runs.filter((run) => run.classification === 'INSPECTION_UNAVAILABLE').length,
    cleanupConfirmed: runs.filter((run) => run.cleanup === 'CONFIRMED').length,
    cleanupUnresolved: runs.filter((run) => !['CONFIRMED', 'NOT_CREATED'].includes(run.cleanup))
      .length,
    expectedCategoryMatched: runs.filter((run) => run.expectedCategoryMatched === true).length,
    expectedCategoryMismatched: runs.filter((run) => run.expectedCategoryMatched === false).length,
    expectedCategoryNotEvaluable:
      runs.filter((run) => run.expectedCategoryMatched === null).length + incomplete,
    percentileMethod: 'nearest-rank',
    latencyPopulation:
      'ALL_ATTEMPTS: measured stage values, including partial failed runs; incomplete attempts contribute to missing counts',
    latency: distributions(runs, incomplete),
    successfulLatencyPopulation:
      'SUCCEEDED execution AND CONFIRMED cleanup AND classification other than INSPECTION_UNAVAILABLE',
    successfulLatency: distributions(successful, 0),
  };
}

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

export function runsCsv(runs: readonly BenchmarkRun[]): string {
  const durations = [...new Set(runs.flatMap((run) => Object.keys(run.durationsMs)))];
  const events = [...new Set(runs.flatMap((run) => Object.keys(run.timestamps)))];
  const headers = [
    'run',
    'expectedCategory',
    'classification',
    'categories',
    'expectedCategoryMatched',
    'execution',
    'cleanup',
    'lifecycle',
    'error',
    'astraInvoked',
    'astraStatus',
    'workerTiming',
    'observationSha256',
    'screenshotSha256',
    ...durations.map((name) => `${name}Ms`),
    ...events.flatMap((name) => [`${name}Iso`, `${name}ElapsedMs`]),
  ];
  const rows = runs.map((run) => [
    run.run,
    run.expectedCategory,
    run.classification,
    run.categories,
    run.expectedCategoryMatched,
    run.execution,
    run.cleanup,
    run.lifecycle,
    run.error,
    run.astraInvoked,
    run.astraStatus,
    run.workerTiming,
    run.observationSha256,
    run.screenshotSha256,
    ...durations.map((name) => run.durationsMs[name]),
    ...events.flatMap((name) => [run.timestamps[name]?.iso, run.timestamps[name]?.elapsedMs]),
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}
