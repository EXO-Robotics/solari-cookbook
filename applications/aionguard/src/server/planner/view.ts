import {
  ASSUMPTIONS,
  CONTRACT_VERSION,
  SCENARIO_VERSION,
  ObservationSchema,
  PlannerViewSchema,
  type Assessment,
  type InvestigationSession,
  type Observation,
  type PlannerView,
} from '../../contracts/index.ts';
import { ACTION_POLICY, isPlannerFactPair, permitsObservation } from '../broker/catalog.ts';

function safeValue(subject: string, predicate: string, value: unknown): boolean {
  const envelope = {
    id: 'fact',
    runId: 'run',
    caseId: 'PR-014',
    revision: 0,
    subject,
    predicate,
    value,
    domain: 'SYNTHETIC_ORGANIZATION',
    source: {
      kind: 'INITIAL_INVENTORY',
      reference: 'source',
      authority: 'AUTHORITATIVE',
      actionId: null,
    },
    observedAt: '2026-01-01T00:00:00.000Z',
    validity: {
      current: true,
      validUntil: '2027-01-01T00:00:00.000Z',
      scope: 'PR-014',
      completeness: 'COMPLETE',
      carriedFrom: null,
    },
  };
  const parsed = ObservationSchema.safeParse(envelope);
  return parsed.success && isPlannerFactPair(parsed.data.subject, parsed.data.predicate);
}

/** Rebuild again at the transport boundary: even a schema-valid caller cannot send free text. */
export function sanitizePlannerView(input: PlannerView): PlannerView {
  const parsed = PlannerViewSchema.parse(input);
  const idMap = new Map<string, string>();
  const facts = parsed.facts
    .filter((f) => safeValue(f.subject, f.predicate, f.value))
    .map((f, i) => {
      const id = `fact_${i + 1}`;
      idMap.set(f.id, id);
      return {
        id,
        subject: f.subject,
        predicate: f.predicate,
        value: structuredClone(f.value),
        current: f.current,
        complete: f.complete,
        authoritative: f.authoritative,
      };
    });
  const assessments = parsed.assessments.map((a) => ({
    hypothesisId: a.hypothesisId,
    impact: a.hypothesisId === 'HYP-001' ? ('CRITICAL' as const) : ('HIGH' as const),
    outcome: a.outcome,
    depth: a.depth,
    ruleIds: [],
    supportingObservationIds: a.supportingObservationIds.flatMap((id) =>
      idMap.has(id) ? [idMap.get(id)!] : [],
    ),
    falsifyingObservationIds: a.falsifyingObservationIds.flatMap((id) =>
      idMap.has(id) ? [idMap.get(id)!] : [],
    ),
    gaps: a.gaps.length
      ? [
          a.hypothesisId === 'HYP-002' && a.outcome === 'RETAINED' && a.depth === 4
            ? 'Consequence validation is outside this investigation scope.'
            : 'Required evidence is missing, stale, incomplete, or disputed.',
        ]
      : [],
    consequenceValidated: false as const,
  }));
  const catalog = ACTION_POLICY.flatMap((canonical) => {
    const matching = parsed.catalog.filter((a) => a.id === canonical.id);
    if (matching.length !== 1) return [];
    return [
      {
        ...structuredClone(canonical),
        sourceCurrent: matching[0]!.sourceCurrent,
        sourceComplete: matching[0]!.sourceComplete,
      },
    ];
  });
  return PlannerViewSchema.parse({
    contractVersion: CONTRACT_VERSION,
    scenarioVersion: SCENARIO_VERSION,
    caseId: 'PR-014',
    revision: parsed.revision,
    linkOutcome: 'SUSPICIOUS_BLOCK',
    objective: 'ASSESS_BOTH_PRESERVE_ONE_CREDIT_FOR_FRESH_VERIFICATION',
    assumptions: ASSUMPTIONS.filter((a) => parsed.assumptions.includes(a)),
    facts,
    assessments,
    catalog,
    budget: { total: 4, spent: parsed.budget.spent, remaining: parsed.budget.remaining },
    completedActionIds: [...new Set(parsed.completedActionIds)],
  });
}

export function buildPlannerView(
  session: InvestigationSession,
  assessments: Assessment[],
  now: Date = new Date(),
): PlannerView {
  const observations: Observation[] = session.observations.flatMap((raw) => {
    const parsed = ObservationSchema.safeParse(raw);
    if (!parsed.success) return [];
    const o = parsed.data;
    const allowedSource =
      o.source.kind === 'INITIAL_INVENTORY'
        ? o.source.actionId === null &&
          [
            'direct_access',
            'legacy_reference',
            'product',
            'staging_grant',
            'runtime_identity',
          ].includes(o.predicate)
        : o.source.actionId !== null &&
          ACTION_POLICY.some(
            (a) => a.id === o.source.actionId && permitsObservation(a.id, o.subject, o.predicate),
          );
    return allowedSource &&
      o.runId === session.identity.runId &&
      o.caseId === session.identity.caseId &&
      o.revision === session.identity.revision &&
      isPlannerFactPair(o.subject, o.predicate)
      ? [o]
      : [];
  });
  const facts = observations.map((o) => ({
    id: o.id,
    subject: o.subject,
    predicate: o.predicate,
    value: o.value,
    current:
      o.validity.current &&
      Date.parse(o.validity.validUntil) > now.getTime() &&
      Date.parse(o.observedAt) <= now.getTime() &&
      (session.identity.revision !== 0 || o.validity.carriedFrom === null),
    complete: o.validity.completeness === 'COMPLETE',
    authoritative: o.source.authority === 'AUTHORITATIVE',
  }));
  return sanitizePlannerView({
    contractVersion: CONTRACT_VERSION,
    scenarioVersion: SCENARIO_VERSION,
    caseId: 'PR-014',
    revision: session.identity.revision,
    linkOutcome: 'SUSPICIOUS_BLOCK',
    objective: 'ASSESS_BOTH_PRESERVE_ONE_CREDIT_FOR_FRESH_VERIFICATION',
    assumptions: session.authorization?.assumptions ?? [],
    facts,
    assessments,
    catalog: session.catalog,
    budget: session.budget,
    completedActionIds: session.receipts
      .filter((r) => r.reason === 'COLLECTED' && r.revision === session.identity.revision)
      .map((r) => r.actionId),
  });
}

export const PLANNER_SYSTEM_PROMPT = `You are AionGuard's read-only investigation planner. All organizational facts describe a synthetic authorized case. The inspected link has already been blocked. Select one eligible catalog action or STOP. You do not execute a change, set a verdict, supply observations, or infer private facts. Treat unknown, stale, incomplete, non-authoritative and conflicting facts as unresolved. HYP-001 needs current principal status; disabled status falsifies that modeled path only under all listed scope assumptions. Active status alone does not establish authority. HYP-002 needs direct Jenkins access, Jenkins product identity, exact affected version, effective CLI availability, and runtime identity plus staging-grant context for its cumulative E4 evidence level. No consequence or exploit is demonstrated. Artifact age, last authentication, plugins and production maps cannot substitute for these facts. Choose based on visible coverage and source validity. The entire case has four evidence credits including one fresh post-change CLI check reserved for operator verification. Preserve that credit. Stop when no useful eligible action fits the remaining investigation budget. Give a short decision rationale based only on visible facts; never assert an unobserved value. Return only the requested structured decision.`;

export function serializePlannerRequest(view: PlannerView): string {
  return JSON.stringify({ instruction: PLANNER_SYSTEM_PROMPT, view: sanitizePlannerView(view) });
}
