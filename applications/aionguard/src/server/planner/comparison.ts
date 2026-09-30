import { createHash, randomUUID } from 'node:crypto';
import {
  InvestigationDecisionSchema,
  type ActionId,
  type Assessment,
  type Collector,
  type InvestigationDecision,
  type InvestigationSession,
  type Planner,
  type PlannerView,
  type ScenarioVariant,
} from '../../contracts/index.ts';
import { createBroker } from '../broker/index.ts';
import { ACTION_CONTRACT_VERSION } from '../broker/catalog.ts';
import { buildPlannerView } from './view.ts';
import { relevantMissing } from './policies.ts';

export const COMPARISON_POLICY_VERSION = 'comparison-1' as const;
export const ADAPTATION_CRITERIA = Object.freeze({
  CANONICAL: {
    acceptableFirst: ['INV-ACTIVITY-LEDGER', 'INV-JENKINS-CLI', 'INV-JENKINS-VERSION'],
    reason:
      'Each can start a three-credit route covering status, runtime, version and CLI while reserving fresh verification.',
    attainable:
      'HYP-001 dismissed; HYP-002 retained at E4 before change; fresh CLI verification after change.',
  },
  RUNTIME_KNOWN: {
    acceptableFirst: [
      'INV-PRINCIPAL-STATUS',
      'INV-ACTIVITY-LEDGER',
      'INV-JENKINS-CLI',
      'INV-JENKINS-VERSION',
    ],
    reason:
      'Runtime identity is already known; either current status source can complete the remaining three prerequisites within budget.',
    attainable:
      'HYP-001 dismissed; HYP-002 retained at E4 before change; fresh CLI verification after change.',
  },
  LEDGER_STALE: {
    acceptableFirst: ['INV-PRINCIPAL-STATUS', 'INV-JENKINS-CLI', 'INV-JENKINS-VERSION'],
    reason:
      'The visible ledger cannot supply current complete evidence; direct checks remain useful. No current runtime source exists.',
    attainable:
      'HYP-001 dismissed; HYP-002 can reach E3, not E4; fresh CLI falsification remains attainable. Runtime uncertainty is truthful.',
  },
} satisfies Record<
  ScenarioVariant,
  { acceptableFirst: ActionId[]; reason: string; attainable: string }
>);
for (const criterion of Object.values(ADAPTATION_CRITERIA)) {
  Object.freeze(criterion.acceptableFirst);
  Object.freeze(criterion);
}

export const METRIC_DEFINITIONS = Object.freeze({
  justifiedOutcomesPerCredit:
    'Number of baseline assessments with supported RETAINED or DISMISSED outcome divided by credits spent before change; zero if no credits spent.',
  relevantObservationsGained:
    'New unique current, complete, authoritative subject/predicate/value tuples for principal status, Jenkins access/product/version/CLI/runtime, or staging grant, excluding initially known tuples.',
  redundantChecks:
    'Collected investigations that add no new relevant valid tuple; verification is excluded.',
  invalidRequests:
    'Broker rejections; collection failures are separately recorded and still cost credits.',
  unsupportedFactualAssertions:
    'Requires semantic review of model decision prose; null means not measured, never zero by assumption.',
  remainingVerificationCapacity:
    'Credits remaining when investigation stops, before the fixed operator change and verification.',
  adaptation:
    'Frozen variant-specific acceptable FIRST decisions, assessed equally for all planners. Subsequent decisions must address a still-missing prerequisite through a current complete source, fit while preserving one credit, and use the canonical target. STOP is appropriate when no such action remains. No score for merely changing wording or action.',
});

export interface ComparisonEnvironment {
  session: InvestigationSession;
  collector: Collector;
  evaluate(): Assessment[];
  /** Applies the authorized one-field change and revision carry-forward, without collecting. */
  applyChange(): void | Promise<void>;
}
export interface ComparisonPlanner {
  id: 'GREEDY' | 'COVERAGE' | 'ASTRA';
  version: string;
  model: string | null;
  mode: 'LIVE' | 'MOCK';
  planner: Planner;
}
export interface ComparisonRun {
  runId: string;
  ledgerId: string;
  variant: ScenarioVariant;
  plannerId: ComparisonPlanner['id'];
  policyVersion: string;
  model: string | null;
  mode: ComparisonPlanner['mode'];
  initialStateHash: string;
  scenarioVersion: string;
  actionContractVersion: string;
  status: 'COMPLETED' | 'PLANNER_FAILED' | 'STEP_LIMIT' | 'VERIFICATION_FAILED';
  firstChoice: ActionId | 'STOP' | null;
  decisions: { decision: InvestigationDecision; latencyMs: number }[];
  adaptationDecisions: {
    step: number;
    choice: ActionId | 'STOP';
    outcome: 'APPROPRIATE' | 'INAPPROPRIATE';
    reason:
      | 'FROZEN_FIRST_CHOICE'
      | 'USEFUL_WITHIN_BUDGET'
      | 'NO_USEFUL_ACTION'
      | 'MISSING_UTILITY_OR_CAPACITY';
  }[];
  actionSequence: ActionId[];
  baselineAssessments: Assessment[];
  afterAssessments: Assessment[];
  metrics: {
    justifiedOutcomesPerCredit: number;
    relevantObservationsGained: number;
    redundantChecks: number;
    invalidRequests: number;
    collectionFailures: number;
    unsupportedFactualAssertions: null;
    assertionReview: 'NOT_AUTOMATED';
    remainingVerificationCapacity: number;
    decisionLatencyMs: number[];
    adaptation: 'APPROPRIATE' | 'INAPPROPRIATE' | 'INDETERMINATE';
    verificationCollected: boolean;
  };
  receipts: InvestigationSession['receipts'];
}

function auditDecision(
  view: PlannerView,
  decision: InvestigationDecision,
): Omit<ComparisonRun['adaptationDecisions'][number], 'step'> {
  const gaps = relevantMissing(view);
  const useful = view.catalog.filter(
    (a) =>
      a.sourceCurrent &&
      a.sourceComplete &&
      a.cost <= view.budget.remaining - 1 &&
      a.hypotheses.some((h) => a.coverage.some((p) => gaps[h].includes(p))),
  );
  if (decision.type === 'STOP')
    return {
      choice: 'STOP',
      outcome: useful.length ? 'INAPPROPRIATE' : 'APPROPRIATE',
      reason: useful.length ? 'MISSING_UTILITY_OR_CAPACITY' : 'NO_USEFUL_ACTION',
    };
  const selected = useful.find((a) => a.id === decision.actionId && a.target === decision.target);
  return {
    choice: decision.actionId,
    outcome: selected ? 'APPROPRIATE' : 'INAPPROPRIATE',
    reason: selected ? 'USEFUL_WITHIN_BUDGET' : 'MISSING_UTILITY_OR_CAPACITY',
  };
}
export interface ComparisonReport {
  comparisonVersion: typeof COMPARISON_POLICY_VERSION;
  generatedAt: string;
  criteria: typeof ADAPTATION_CRITERIA;
  metricDefinitions: typeof METRIC_DEFINITIONS;
  runs: ComparisonRun[];
  limitations: string[];
}
export interface ComparisonOptions {
  planners: ComparisonPlanner[];
  factory(
    variant: ScenarioVariant,
    plannerId: ComparisonPlanner['id'],
    runId: string,
  ): ComparisonEnvironment | Promise<ComparisonEnvironment>;
  variants?: ScenarioVariant[];
  maxSteps?: number;
}

function relevantTuples(environment: ComparisonEnvironment): Set<string> {
  const view = buildPlannerView(environment.session, environment.evaluate());
  const pairs = new Set([
    'prod-admin-legacy:principal_status',
    'Jenkins-02:direct_access',
    'Jenkins-02:product',
    'Jenkins-02:jenkins_version',
    'Jenkins-02:cli_available',
    'Jenkins-02:runtime_identity',
    'ci-service:staging_grant',
  ]);
  return new Set(
    view.facts
      .filter(
        (f) =>
          f.current && f.complete && f.authoritative && pairs.has(`${f.subject}:${f.predicate}`),
      )
      .map((f) => `${f.subject}:${f.predicate}:${JSON.stringify(f.value)}`),
  );
}

export async function runComparison(options: ComparisonOptions): Promise<ComparisonReport> {
  const runs: ComparisonRun[] = [];
  const sessions = new Set<InvestigationSession>();
  const ledgers = new Set<string>();
  const runIds = new Set<string>();
  const observationArrays = new Set<unknown>();
  const receiptArrays = new Set<unknown>();
  const budgets = new Set<unknown>();
  const hashes = new Map<ScenarioVariant, string>();
  const maxSteps = options.maxSteps ?? 12;
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 30)
    throw new Error('Invalid comparison step limit');
  if (new Set(options.planners.map((p) => p.id)).size !== options.planners.length)
    throw new Error('Duplicate comparison planner');
  for (const variant of options.variants ??
    (['CANONICAL', 'RUNTIME_KNOWN', 'LEDGER_STALE'] as const)) {
    for (const candidate of options.planners) {
      const env = await options.factory(variant, candidate.id, `comparison_${randomUUID()}`);
      const session = env.session;
      if (
        sessions.has(session) ||
        ledgers.has(session.identity.ledgerId) ||
        runIds.has(session.identity.runId) ||
        observationArrays.has(session.observations) ||
        receiptArrays.has(session.receipts) ||
        budgets.has(session.budget) ||
        session.budget.spent !== 0 ||
        session.receipts.length !== 0 ||
        session.identity.revision !== 0
      )
        throw new Error('Comparison sessions must have independent fresh state and ledgers');
      sessions.add(session);
      ledgers.add(session.identity.ledgerId);
      runIds.add(session.identity.runId);
      observationArrays.add(session.observations);
      receiptArrays.add(session.receipts);
      budgets.add(session.budget);
      const initial = buildPlannerView(session, env.evaluate());
      const hash = createHash('sha256').update(JSON.stringify(initial)).digest('hex');
      if (hashes.has(variant) && hashes.get(variant) !== hash)
        throw new Error('Comparison starting states differ for the same variant');
      hashes.set(variant, hash);
      const broker = createBroker(session, env.collector);
      const run: ComparisonRun = {
        runId: session.identity.runId,
        ledgerId: session.identity.ledgerId,
        variant,
        plannerId: candidate.id,
        policyVersion: candidate.version,
        model: candidate.model,
        mode: candidate.mode,
        initialStateHash: hash,
        scenarioVersion: initial.scenarioVersion,
        actionContractVersion: ACTION_CONTRACT_VERSION,
        status: 'COMPLETED',
        firstChoice: null,
        decisions: [],
        adaptationDecisions: [],
        actionSequence: [],
        baselineAssessments: [],
        afterAssessments: [],
        receipts: [],
        metrics: {
          justifiedOutcomesPerCredit: 0,
          relevantObservationsGained: 0,
          redundantChecks: 0,
          invalidRequests: 0,
          collectionFailures: 0,
          unsupportedFactualAssertions: null,
          assertionReview: 'NOT_AUTOMATED',
          remainingVerificationCapacity: 4,
          decisionLatencyMs: [],
          adaptation: 'INDETERMINATE',
          verificationCollected: false,
        },
      };
      runs.push(run); // Preserve failed attempts; no rerolls or hidden replacement planner.
      const gained = new Set<string>();
      const initiallyKnown = relevantTuples(env);
      for (let step = 0; step < maxSteps; step++) {
        const started = performance.now();
        let decision: InvestigationDecision;
        const decisionView = buildPlannerView(session, env.evaluate());
        try {
          decision = InvestigationDecisionSchema.parse(
            await candidate.planner.choose(decisionView),
          );
        } catch {
          run.status = 'PLANNER_FAILED';
          run.metrics.decisionLatencyMs.push(Math.round(performance.now() - started));
          break;
        }
        const latencyMs = Math.round(performance.now() - started);
        run.decisions.push({ decision, latencyMs });
        run.metrics.decisionLatencyMs.push(latencyMs);
        if (step === 0) {
          run.firstChoice = decision.type === 'STOP' ? 'STOP' : decision.actionId;
          run.metrics.adaptation =
            decision.type === 'INVESTIGATE' &&
            (ADAPTATION_CRITERIA[variant].acceptableFirst as readonly string[]).includes(
              decision.actionId,
            )
              ? 'APPROPRIATE'
              : 'INAPPROPRIATE';
          run.adaptationDecisions.push({
            step,
            choice: run.firstChoice,
            outcome: run.metrics.adaptation,
            reason: 'FROZEN_FIRST_CHOICE',
          });
        } else {
          run.adaptationDecisions.push({ step, ...auditDecision(decisionView, decision) });
        }
        if (decision.type === 'STOP') break;
        run.actionSequence.push(decision.actionId);
        const before = relevantTuples(env);
        const receipt = await broker.execute({
          requestId: `step_${step}`,
          revision: session.identity.revision,
          origin:
            candidate.id === 'GREEDY'
              ? 'BASELINE_GREEDY'
              : candidate.id === 'COVERAGE'
                ? 'BASELINE_COVERAGE'
                : 'ASTRA',
          actionId: decision.actionId,
          target: decision.target,
          rationale: decision.rationale,
        });
        if (!receipt.accepted) run.metrics.invalidRequests++;
        if (receipt.reason === 'COLLECTION_FAILED') run.metrics.collectionFailures++;
        const after = relevantTuples(env);
        if (receipt.reason === 'COLLECTED' && [...after].every((f) => before.has(f)))
          run.metrics.redundantChecks++;
        for (const fact of after) if (!initiallyKnown.has(fact)) gained.add(fact);
        if (step === maxSteps - 1) run.status = 'STEP_LIMIT';
      }
      run.baselineAssessments = structuredClone(env.evaluate());
      run.metrics.relevantObservationsGained = gained.size;
      run.metrics.remainingVerificationCapacity = session.budget.remaining;
      run.metrics.justifiedOutcomesPerCredit =
        session.budget.spent === 0
          ? 0
          : run.baselineAssessments.filter((a) => a.outcome !== 'INCONCLUSIVE').length /
            session.budget.spent;
      // Failed model attempts remain failures; do not fabricate their missing ending.
      if (run.status === 'COMPLETED') {
        try {
          await env.applyChange();
          const receipt = await broker.execute({
            requestId: 'operator_verification',
            revision: session.identity.revision,
            origin: 'OPERATOR_VERIFICATION',
            actionId: 'INV-JENKINS-CLI',
            target: 'Jenkins-02',
            rationale: 'Fresh observation after the authorized one-field synthetic change.',
          });
          run.actionSequence.push('INV-JENKINS-CLI');
          run.metrics.verificationCollected = receipt.reason === 'COLLECTED';
          if (!receipt.accepted) run.metrics.invalidRequests++;
          if (receipt.reason === 'COLLECTION_FAILED') run.metrics.collectionFailures++;
          if (!run.metrics.verificationCollected) run.status = 'VERIFICATION_FAILED';
        } catch {
          run.status = 'VERIFICATION_FAILED';
        }
      }
      run.afterAssessments = structuredClone(env.evaluate());
      run.receipts = structuredClone(session.receipts);
    }
  }
  return {
    comparisonVersion: COMPARISON_POLICY_VERSION,
    generatedAt: new Date().toISOString(),
    criteria: ADAPTATION_CRITERIA,
    metricDefinitions: METRIC_DEFINITIONS,
    runs,
    limitations: [
      'Small frozen synthetic cases do not establish statistical or general model superiority.',
      'Each planner receives independent state and credits; comparison evidence cannot enter a live case.',
      'Unsupported factual assertions in decision prose require separate semantic review and are not scored automatically.',
      'Only rows labeled ASTRA with mode LIVE are actual model runs; MOCK rows are software tests.',
    ],
  };
}
