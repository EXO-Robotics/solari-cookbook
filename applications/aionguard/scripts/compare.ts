import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  ASSUMPTIONS,
  CONTRACT_VERSION,
  type Change,
  type InvestigationSession,
} from '../src/contracts/index.js';
import { createSyntheticEnvironment, catalogFor } from '../src/server/fixtures/index.js';
import { evaluate } from '../src/server/evidence/index.js';
import {
  CliAstraPlanner,
  GreedyPlanner,
  CoverageAwarePlanner,
  GREEDY_POLICY_VERSION,
  COVERAGE_POLICY_VERSION,
  runComparison,
  type ComparisonPlanner,
} from '../src/server/planner/index.js';
import { readConfig } from '../src/server/runtime/config.js';
import type { PlannerTrace } from '../src/server/planner/astra.js';

const args = process.argv.slice(2);
if (args.some((arg) => !['--live-astra', '--help'].includes(arg)))
  throw new Error('Supported arguments: --live-astra, --help');
if (args.includes('--help')) {
  console.info(
    'npm run compare: independent deterministic baselines only. Add -- --live-astra to explicitly spend configured Astra usage on all three frozen variants. No Vercel calls. Results are stored under runtime-data/comparisons/.',
  );
  process.exit(0);
}
const config = readConfig();
const astraTraces: PlannerTrace[] = [];
const planners: ComparisonPlanner[] = [
  {
    id: 'GREEDY',
    version: GREEDY_POLICY_VERSION,
    model: null,
    mode: 'MOCK',
    planner: new GreedyPlanner(),
  },
  {
    id: 'COVERAGE',
    version: COVERAGE_POLICY_VERSION,
    model: null,
    mode: 'MOCK',
    planner: new CoverageAwarePlanner(),
  },
];
if (args.includes('--live-astra'))
  planners.push({
    id: 'ASTRA',
    version: 'astra-cli-2',
    model: config.OPENAI_MODEL,
    mode: 'LIVE',
    planner: new CliAstraPlanner({
      executable: config.ASTRA_CLI_PATH,
      timeoutMs: config.ASTRA_TIMEOUT_MS,
      model: config.OPENAI_MODEL,
      onTrace: (trace) => astraTraces.push(trace),
    }),
  });
const report = await runComparison({
  planners,
  factory: (variant, _planner, runId) => {
    const environment = createSyntheticEnvironment(variant);
    const identity = {
      schemaVersion: CONTRACT_VERSION,
      caseId: 'PR-014' as const,
      runId,
      attemptId: `attempt_${randomUUID()}`,
      ledgerId: `ledger_${randomUUID()}`,
      revision: 0,
    };
    const authorization = {
      id: `auth_${randomUUID()}`,
      at: new Date().toISOString(),
      scenario: 'SYNTHETIC_ASSUMED_COMPROMISE' as const,
      principal: 'Apprentice-07' as const,
      assumptions: [...ASSUMPTIONS],
      change: 'jenkins.cli_enabled:true->false' as const,
    };
    const session: InvestigationSession = {
      identity,
      authorization,
      observations: environment.initialObservations(identity),
      receipts: [],
      budget: { total: 4, spent: 0, remaining: 4 },
      catalog: catalogFor(variant),
    };
    let change: Change | undefined;
    return {
      session,
      collector: (action, current) => environment.collect(action, current),
      evaluate: () =>
        evaluate(session.identity, session.observations, session.authorization, undefined, {
          change,
          receipts: session.receipts,
        }),
      applyChange: () => {
        const result = environment.applyChange(
          session.identity,
          authorization,
          session.observations,
        );
        session.identity = result.identity;
        session.observations = result.observations;
        change = result.change;
      },
    };
  },
});
await mkdir('runtime-data/comparisons', { recursive: true, mode: 0o700 });
const output = resolve(
  'runtime-data/comparisons',
  `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.json`,
);
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const traceOutput = output.replace(/\.json$/, '.astra-traces.json');
if (args.includes('--live-astra'))
  await writeFile(traceOutput, JSON.stringify(astraTraces, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
console.info(
  JSON.stringify(
    {
      output,
      rows: report.runs.length,
      astraAttempts: report.runs.filter((r) => r.plannerId === 'ASTRA' && r.mode === 'LIVE').length,
      completedAstraRuns: report.runs.filter(
        (r) => r.plannerId === 'ASTRA' && r.mode === 'LIVE' && r.status === 'COMPLETED',
      ).length,
      astraTraceOutput: args.includes('--live-astra') ? traceOutput : null,
      results: report.runs.map((r) => ({
        variant: r.variant,
        planner: r.plannerId,
        firstChoice: r.firstChoice,
        status: r.status,
        verificationCapacity: r.metrics.remainingVerificationCapacity,
        baseline: r.baselineAssessments.map((a) => ({
          id: a.hypothesisId,
          outcome: a.outcome,
          depth: a.depth,
        })),
      })),
    },
    null,
    2,
  ),
);

// Latest display copy points at the last complete report; immutable timestamped reports remain.
await writeFile('runtime-data/comparison-latest.json', JSON.stringify(report, null, 2) + '\n', {
  mode: 0o600,
});
