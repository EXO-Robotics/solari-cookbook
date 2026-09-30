import { useEffect, useState } from 'react';
import { CaseComparisonSchema, type CaseComparison } from '../contracts/index.js';
import { request } from './api.js';
export function ComparisonStrip({
  token,
  runId,
  classification,
}: {
  token: string;
  runId: string;
  classification: string;
}) {
  const [report, setReport] = useState<CaseComparison | null>(null);
  useEffect(() => {
    let stopped = false;
    setReport(null);
    void request(`/api/attempts/${runId}/comparison`, token)
      .then((value) => {
        if (!stopped) setReport(CaseComparisonSchema.nullable().parse(value));
      })
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [token, runId, classification]);
  return (
    <section className="comparison-note">
      <span className="eyebrow">PLANNER COMPARISON</span>
      {report ? (
        <div className="comparison-results">
          <span className="subtle">
            Precomputed offline · matching initial state and policy versions
          </span>
          <div>
            {report.rows.map((row) => (
              <span className="comparison-row" key={row.plannerId}>
                <strong>
                  {row.plannerId === 'COVERAGE'
                    ? 'Coverage-aware'
                    : row.plannerId === 'GREEDY'
                      ? 'Greedy'
                      : `${row.mode} Astra`}
                </strong>
                <span>
                  {row.status.replaceAll('_', ' ').toLowerCase()} · Jenkins E
                  {row.baselineAssessments.find((h) => h.hypothesisId === 'HYP-002')?.depth ?? '—'}{' '}
                  · {row.metrics.remainingVerificationCapacity} verification credit
                </span>
              </span>
            ))}
          </div>
          {!report.actualAstraMeasured ? (
            <p>Live Astra measurements are pending. These results do not supply case evidence.</p>
          ) : (
            <p>
              Small fixture results do not establish general superiority. Full attempts remain in
              the report.
            </p>
          )}
        </div>
      ) : (
        <p>
          No matching precomputed report is loaded. Live Astra measurements are pending; no winning
          result is assumed.
        </p>
      )}
    </section>
  );
}
