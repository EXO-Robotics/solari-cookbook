import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CliAstraEvidenceReviewer,
  type ReviewEvidence,
  type ReviewTrace,
  type EvidenceReview,
} from '../src/server/planner/review.ts';
import { ASTRA_MODEL, PlannerUnavailableError } from '../src/server/planner/astra.ts';

const base: ReviewEvidence = {
  schemaVersion: '1',
  passwordField: false,
  pageOrigin: 'APPROVED',
  formDestination: 'NONE',
  redirected: false,
  downloadLinkCount: 0,
  heuristicCategories: [],
  collection: 'STATIC_SCRIPTS_DISABLED',
};
/** Authored structural inputs, NOT live pages, model training data, or accuracy ground truth. */
export const REVIEW_CASES: readonly {
  id: string;
  description: string;
  evidence: ReviewEvidence;
}[] = [
  {
    id: 'benign-shaped',
    description:
      'No password form or heuristic indicators; expected uncertainty, not a safety verdict.',
    evidence: { ...base },
  },
  {
    id: 'credential-shaped',
    description: 'Unapproved password page with an unapproved external form destination.',
    evidence: {
      ...base,
      passwordField: true,
      pageOrigin: 'UNAPPROVED',
      formDestination: 'UNAPPROVED_EXTERNAL',
      heuristicCategories: ['CREDENTIAL_PHISHING', 'CROSS_ORIGIN_CREDENTIAL_SUBMISSION'],
    },
  },
  {
    id: 'ambiguous-shaped',
    description: 'Approved login redirects to another approved identity-provider origin.',
    evidence: {
      ...base,
      passwordField: true,
      formDestination: 'APPROVED_EXTERNAL',
      redirected: true,
    },
  },
];
export function parseArguments(args: string[]) {
  let live = false;
  let runs = 6;
  let output = `runtime-data/astra-review-${new Date().toISOString().replaceAll(':', '-')}`;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (seen.has(argument)) throw new Error('Duplicate option');
    seen.add(argument);
    if (argument === '--live') live = true;
    else if (argument === '--runs') {
      const value = args[++index];
      if (!value || !/^\d+$/.test(value)) throw new Error('Invalid runs');
      runs = Number(value);
    } else if (argument === '--output') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error('Invalid output');
      output = value;
    } else throw new Error('Unknown option');
  }
  if (!live || !Number.isInteger(runs) || runs < 1 || runs > 10)
    throw new Error('Use --live and --runs 1..10');
  return { runs, output: path.resolve(output) };
}
function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  return sorted[lower]! + (sorted[Math.ceil(position)]! - sorted[lower]!) * (position - lower);
}
export async function benchmark(args: string[]) {
  const options = parseArguments(args);
  await mkdir(path.dirname(options.output), { recursive: true });
  await mkdir(options.output); // A run never overwrites existing evidence.
  const rows: {
    run: number;
    caseId: string;
    result: EvidenceReview | null;
    trace: ReviewTrace | null;
    failure: string | null;
  }[] = [];
  for (let index = 0; index < options.runs; index++) {
    const fixture = REVIEW_CASES[index % REVIEW_CASES.length]!;
    let trace: ReviewTrace | null = null;
    let result: EvidenceReview | null = null;
    let failure: string | null = null;
    const reviewer = new CliAstraEvidenceReviewer({
      onTrace: (value) => {
        trace = value;
      },
    });
    try {
      result = await reviewer.review(fixture.evidence);
    } catch (error) {
      failure = error instanceof PlannerUnavailableError ? error.code : 'TRANSPORT_FAILED';
    }
    rows.push({ run: index + 1, caseId: fixture.id, result, trace, failure });
    console.log(
      JSON.stringify({
        run: index + 1,
        total: options.runs,
        caseId: fixture.id,
        outcome: failure ?? 'SUCCEEDED',
      }),
    );
    await writeFile(
      path.join(options.output, 'results.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          kind: 'LIVE_ASTRA_STRUCTURAL_REPLAY',
          model: ASTRA_MODEL,
          cases: REVIEW_CASES,
          rows,
        },
        null,
        2,
      ) + '\n',
    );
  }
  const successful = rows.filter((row) => row.result && row.trace?.outcome === 'SUCCEEDED');
  const durations = successful.map((row) => row.trace!.totalMs);
  const root = fileURLToPath(new URL('../', import.meta.url));
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      [
        'src/server/planner/review.ts',
        'src/server/planner/astra.ts',
        'scripts/benchmark-astra-review.ts',
      ].map(async (file) => [
        file,
        createHash('sha256')
          .update(await readFile(path.join(root, file)))
          .digest('hex'),
      ]),
    ),
  );
  const report = {
    sourceHashes,
    schemaVersion: 1,
    kind: 'LIVE_ASTRA_STRUCTURAL_REPLAY',
    model: ASTRA_MODEL,
    reasoningEffort: 'medium',
    requested: options.runs,
    succeeded: successful.length,
    failed: rows.length - successful.length,
    medianMs: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    percentileMethod:
      'linear interpolation at (n-1)*p, successful calls only; failures reported separately',
    perCase: REVIEW_CASES.map((fixture) => ({
      caseId: fixture.id,
      count: successful.filter((row) => row.caseId === fixture.id).length,
    })),
    boundary:
      'Local request serialization through restricted CLI response validation and temporary-file cleanup. CLI round trip includes process startup, authentication/transport, model service, and CLI exit; it is not pure model reasoning time.',
    limitations: [
      'Three authored structural cases repeated; not fresh browser observations.',
      'No automatic escalation in the default detector.',
      'No Safari interception, navigation release, threat accuracy, or host containment measured.',
      'Advisory verdicts never authorize navigation.',
    ],
  };
  await writeFile(
    path.join(options.output, 'summary.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  const fields = [
    'run',
    'caseId',
    'outcome',
    'verdict',
    'model',
    'requestSha256',
    'requestBytes',
    'responseBytes',
    'startedAt',
    'invocationStartedAt',
    'responseReceivedAt',
    'validatedAt',
    'returnedAt',
    'setupMs',
    'cliRoundTripMs',
    'validationMs',
    'totalMs',
  ];
  const cell = (value: unknown) => JSON.stringify(value == null ? '' : String(value));
  const csv =
    [
      fields.join(','),
      ...rows.map((row) => {
        const flattened: Record<string, unknown> = {
          ...row.trace,
          run: row.run,
          caseId: row.caseId,
          outcome: row.failure ?? 'SUCCEEDED',
          verdict: row.result?.verdict,
        };
        return fields.map((field) => cell(flattened[field])).join(',');
      }),
    ].join('\n') + '\n';
  await writeFile(path.join(options.output, 'results.csv'), csv);
  console.log(JSON.stringify(report));
  if (report.failed) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  benchmark(process.argv.slice(2)).catch(() => {
    console.error(
      'Astra review benchmark could not complete. Use --live --runs 1..10 --output <new-directory>.',
    );
    process.exitCode = 1;
  });
}
