import type {
  HypothesisId,
  InvestigationDecision,
  InvestigationDefinition,
  Planner,
  PlannerView,
  Predicate,
  Subject,
} from '../../contracts/index.ts';
import { sanitizePlannerView } from './view.ts';

export const GREEDY_POLICY_VERSION = 'greedy-1' as const;
export const COVERAGE_POLICY_VERSION = 'coverage-1' as const;
export const PREREQUISITES: Readonly<
  Record<HypothesisId, readonly { subject: Subject; predicate: Predicate }[]>
> = Object.freeze({
  'HYP-001': [{ subject: 'prod-admin-legacy', predicate: 'principal_status' }],
  'HYP-002': [
    { subject: 'Jenkins-02', predicate: 'direct_access' },
    { subject: 'Jenkins-02', predicate: 'product' },
    { subject: 'Jenkins-02', predicate: 'jenkins_version' },
    { subject: 'Jenkins-02', predicate: 'cli_available' },
    { subject: 'Jenkins-02', predicate: 'runtime_identity' },
    { subject: 'ci-service', predicate: 'staging_grant' },
  ],
});
for (const requirements of Object.values(PREREQUISITES)) {
  for (const requirement of requirements) Object.freeze(requirement);
  Object.freeze(requirements);
}
function missing(view: PlannerView, hypothesis: HypothesisId): Predicate[] {
  if (view.assessments.find((a) => a.hypothesisId === hypothesis)?.outcome === 'DISMISSED')
    return [];
  return PREREQUISITES[hypothesis]
    .filter((requirement) => {
      const facts = view.facts.filter(
        (f) =>
          f.subject === requirement.subject &&
          f.predicate === requirement.predicate &&
          f.current &&
          f.complete &&
          f.authoritative,
      );
      return facts.length === 0 || new Set(facts.map((f) => JSON.stringify(f.value))).size > 1;
    })
    .map((r) => r.predicate);
}
export function relevantMissing(view: PlannerView): Record<HypothesisId, Predicate[]> {
  return { 'HYP-001': missing(view, 'HYP-001'), 'HYP-002': missing(view, 'HYP-002') };
}
function candidates(view: PlannerView): InvestigationDefinition[] {
  return view.catalog.filter(
    (a) =>
      a.cost <= view.budget.remaining - 1 &&
      a.sourceCurrent &&
      a.sourceComplete &&
      !view.completedActionIds.includes(a.id),
  );
}
function stop(): InvestigationDecision {
  return {
    type: 'STOP',
    rationale:
      'No useful current evidence action fits while preserving one credit for fresh verification.',
  };
}
function decision(
  action: InvestigationDefinition,
  hypotheses: HypothesisId[],
  rationale: string,
): InvestigationDecision {
  return {
    type: 'INVESTIGATE',
    actionId: action.id,
    target: action.target,
    hypothesisIds: hypotheses,
    rationale,
  };
}
export class GreedyPlanner implements Planner {
  async choose(input: PlannerView): Promise<InvestigationDecision> {
    const view = sanitizePlannerView(input);
    if (view.revision !== 0) return stop();
    const gaps = relevantMissing(view);
    for (const id of ['HYP-001', 'HYP-002'] as const) {
      const possible = candidates(view)
        .filter((a) => a.hypotheses.includes(id) && a.coverage.some((p) => gaps[id].includes(p)))
        .sort(
          (a, b) =>
            a.cost - b.cost || a.hypotheses.length - b.hypotheses.length || a.order - b.order,
        );
      if (possible[0])
        return decision(
          possible[0],
          [id],
          'Cheapest relevant check for the highest-impact unresolved hypothesis; ties favor narrower coverage and catalog order.',
        );
    }
    return stop();
  }
}
export class CoverageAwarePlanner implements Planner {
  async choose(input: PlannerView): Promise<InvestigationDecision> {
    const view = sanitizePlannerView(input);
    if (view.revision !== 0) return stop();
    const gaps = relevantMissing(view);
    const ranked = candidates(view)
      .map((a) => {
        const impacted = (['HYP-001', 'HYP-002'] as const).filter(
          (h) => a.hypotheses.includes(h) && a.coverage.some((p) => gaps[h].includes(p)),
        );
        const relevant = new Set(
          impacted.flatMap((h) => a.coverage.filter((p) => gaps[h].includes(p))),
        );
        return {
          action: a,
          score: relevant.size / a.cost,
          impacted,
          priority: impacted.includes('HYP-001') ? 2 : 1,
        };
      })
      .filter((a) => a.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.priority - a.priority ||
          a.action.cost - b.action.cost ||
          a.action.order - b.action.order,
      );
    const selected = ranked[0];
    return selected
      ? decision(
          selected.action,
          selected.impacted,
          'Most relevant unresolved prerequisites per credit from a current complete source; fixed priority, cost, and catalog-order tie-breaks.',
        )
      : stop();
  }
}

/** Explicit software-testing mode; callers must retain the MOCK provenance label. */
export class MockPlanner extends CoverageAwarePlanner {}
