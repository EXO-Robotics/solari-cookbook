import { z } from 'zod';
import {
  CaseComparisonSchema,
  ComparisonRowSchema,
  type CaseComparison,
} from '../../contracts/index.js';
const ReportSchema = z.object({
  comparisonVersion: z.literal('comparison-1'),
  generatedAt: z.iso.datetime(),
  runs: z.array(ComparisonRowSchema).max(9),
});
const versions = { GREEDY: 'greedy-1', COVERAGE: 'coverage-1', ASTRA: 'astra-cli-2' } as const;
/** Precomputed results are display-only and never imported into a case's evidence ledger. */
export function projectComparison(
  report: unknown,
  initialStateHash: string | null,
): CaseComparison | null {
  if (!initialStateHash) return null;
  const parsed = ReportSchema.safeParse(report);
  if (!parsed.success) return null;
  const rows = parsed.data.runs.filter(
    (run) =>
      run.initialStateHash === initialStateHash && run.policyVersion === versions[run.plannerId],
  );
  if (!rows.length || new Set(rows.map((row) => row.plannerId)).size !== rows.length) return null;
  return CaseComparisonSchema.parse({
    source: 'PRECOMPUTED_OFFLINE',
    generatedAt: parsed.data.generatedAt,
    initialStateHash,
    rows,
    actualAstraMeasured: rows.some(
      (row) => row.plannerId === 'ASTRA' && row.mode === 'LIVE' && row.firstChoice !== null,
    ),
  });
}
