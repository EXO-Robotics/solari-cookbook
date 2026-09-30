import { applyReleasePolicy, type ReleasePolicy } from './release-policy.js';
import { createHash, randomUUID } from 'node:crypto';
import {
  ASSUMPTIONS,
  AuthorizeCommandSchema,
  CaseEventSchema,
  CaseReceiptSchema,
  CaseSnapshotSchema,
  CONTRACT_VERSION,
  InspectionResultSchema,
  InvestigationDecisionSchema,
  SCENARIO_VERSION,
  type Assessment,
  type Authorization,
  type CaseEvent,
  type CaseIdentity,
  type CaseReceipt,
  type CaseSnapshot,
  type Change,
  type EventType,
  type InspectionResult,
  type Inspector,
  type InvestigationSession,
  type LinkAssessment,
  type Mode,
  type Planner,
  type ScenarioVariant,
} from '../../contracts/index.js';
import { createSyntheticEnvironment, catalogFor } from '../fixtures/index.js';
import { evaluate, deriveAccess } from '../evidence/index.js';
import { createBroker } from '../broker/index.js';
import { buildPlannerView } from '../planner/index.js';
import { validPng } from '../isolation/policy.js';
import { detectThreats, DETECTION_LIMITS } from '../detection/index.js';
import { projectComparison } from './comparison.js';

export class CommandError extends Error {
  constructor(
    readonly code: string,
    readonly status = 409,
  ) {
    super(code);
  }
}
type Environment = ReturnType<typeof createSyntheticEnvironment>;
interface Attempt {
  initialStateHash: string | null;
  session: InvestigationSession;
  environment: Environment;
  broker: ReturnType<typeof createBroker>;
  execution: CaseSnapshot['execution'];
  link: LinkAssessment;
  png: Buffer | null;
  baseline: CaseSnapshot['baseline'];
  change: Change | null;
  verification: CaseSnapshot['verification'];
  events: CaseEvent[];
  trigger: 'NOT_STARTED' | 'OPERATOR_DIRECT' | 'SAFARI_HANDOFF' | 'CHROME_HANDOFF' | 'MOCK';
  busy: boolean;
  commands: Map<string, { signature: string; result: Promise<CaseSnapshot> }>;
}
const iso = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID()}`;
const emptyCleanup = () => ({
  state: 'NOT_CREATED' as const,
  sandboxId: null,
  stoppedAt: null,
  deletedAt: null,
});
export interface ControllerOptions {
  releasePolicy?: ReleasePolicy;
  workflow?: 'DETECTOR' | 'SYNTHETIC';
  inspectionSource?: InspectionResult['source'];
  comparisonReport?: unknown;
  inspector: Inspector;
  planner: Planner;
  inspectionMode: Mode;
  plannerMode: Mode;
  approvedIdpOrigins: string[];
  maxAttempts?: number;
}

export class CaseController {
  private readonly attempts = new Map<string, Attempt>();
  private readonly entries = new Map<string, string>();
  private armedRunId: string | null = null;
  constructor(private readonly options: ControllerOptions) {}

  create(variant: ScenarioVariant = 'CANONICAL'): CaseSnapshot {
    if (this.attempts.size >= (this.options.maxAttempts ?? 25))
      throw new CommandError('ATTEMPT_LIMIT_EXPORT_AND_RESTART', 429);
    const identity: CaseIdentity = {
      schemaVersion: CONTRACT_VERSION,
      caseId: 'PR-014',
      runId: id('run'),
      attemptId: id('attempt'),
      ledgerId: id('ledger'),
      revision: 0,
    };
    const session: InvestigationSession = {
      identity,
      authorization: null,
      observations: [],
      receipts: [],
      budget: { total: 4, spent: 0, remaining: 4 },
      catalog: catalogFor(variant),
    };
    const environment = createSyntheticEnvironment(variant);
    const attempt: Attempt = {
      initialStateHash: null,
      session,
      environment,
      broker: createBroker(session, (action, current) => environment.collect(action, current)),
      execution: 'READY',
      png: null,
      baseline: null,
      change: null,
      verification: 'NOT_REQUESTED',
      events: [],
      trigger: 'NOT_STARTED',
      busy: false,
      commands: new Map(),
      link: {
        execution: 'PENDING',
        classification: 'PENDING',
        decision: 'BLOCK',
        ruleIds: [],
        findings: [],
        mode: this.options.inspectionMode,
        observation: null,
        imagePath: null,
        source: this.options.inspectionSource ?? 'VERCEL_SANDBOX',
        cleanup: emptyCleanup(),
        failure: null,
        timing: {
          heldAt: iso(),
          createdAt: null,
          collectionStartedAt: null,
          returnedAt: null,
          blockedAt: null,
        },
      },
    };
    this.attempts.set(identity.runId, attempt);
    this.event(attempt, 'ATTEMPT_CREATED');
    return this.snapshot(identity.runId);
  }
  list(): CaseSnapshot[] {
    return [...this.attempts.keys()].map((run) => this.snapshot(run));
  }
  revokeEntry(): void {
    this.armedRunId = null;
  }
  armEntry(runId: string): void {
    const a = this.get(runId);
    if (a.execution !== 'READY' || a.busy || !a.session.authorization)
      throw new CommandError('AUTHORIZED_READY_CASE_REQUIRED');
    this.armedRunId = runId;
  }
  comparison(runId: string) {
    return projectComparison(this.options.comparisonReport, this.get(runId).initialStateHash);
  }
  authorize(runId: string, command: unknown): CaseSnapshot {
    const a = this.get(runId);
    const parsed = AuthorizeCommandSchema.safeParse(command);
    if (!parsed.success) throw new CommandError('INVALID_AUTHORIZATION', 400);
    if (a.execution !== 'READY' || a.busy) throw new CommandError('AUTHORIZATION_WINDOW_CLOSED');
    const expected =
      this.options.workflow === 'DETECTOR'
        ? 'OWNED_FIXTURE_INSPECTION'
        : 'SYNTHETIC_ASSUMED_COMPROMISE';
    if (parsed.data.scenario !== expected)
      throw new CommandError('AUTHORIZATION_SCOPE_MISMATCH', 400);
    if (!a.session.authorization) {
      a.session.authorization = {
        id: id('auth'),
        at: iso(),
        principal: 'Apprentice-07',
        ...parsed.data,
      };
      this.event(a, 'AUTHORIZED', { referenceId: a.session.authorization.id });
    }
    this.armedRunId = runId;
    return this.snapshot(runId);
  }
  entry(
    fixtureId: string,
    requestId: string,
  ): { runId: string; completion: Promise<CaseSnapshot> } {
    if (fixtureId !== 'acme-login') throw new CommandError('UNREGISTERED_FIXTURE', 400);
    const existing = this.entries.get(requestId);
    if (existing) return { runId: existing, completion: Promise.resolve(this.snapshot(existing)) };
    if (!this.armedRunId) throw new CommandError('OPERATOR_AUTHORIZATION_REQUIRED');
    const runId = this.armedRunId;
    const a = this.get(runId);
    if (a.execution !== 'READY' || !a.session.authorization)
      throw new CommandError('ATTEMPT_NOT_READY');
    this.entries.set(requestId, runId);
    this.armedRunId = null;
    return { runId, completion: this.inspect(runId, fixtureId, requestId) };
  }
  inspect(
    runId: string,
    fixtureId: string,
    requestId: string,
    trigger: Attempt['trigger'] = 'SAFARI_HANDOFF',
  ): Promise<CaseSnapshot> {
    return this.command(runId, requestId, `inspect:${fixtureId}:0`, async (a) => {
      if (fixtureId !== 'acme-login') throw new CommandError('UNREGISTERED_FIXTURE', 400);
      if (!a.session.authorization) throw new CommandError('OPERATOR_AUTHORIZATION_REQUIRED');
      if (a.execution !== 'READY') throw new CommandError('INSPECTION_ALREADY_ATTEMPTED');
      a.trigger = this.options.inspectionMode === 'MOCK' ? 'MOCK' : trigger;
      a.execution = 'INSPECTING';
      a.link.timing.heldAt = iso();
      if (a.trigger === 'SAFARI_HANDOFF' || a.trigger === 'CHROME_HANDOFF')
        this.event(a, 'NAVIGATION_HELD', {
          reason: 'Trusted handoff reported; endpoint interception requires separate measurement.',
        });
      this.event(a, 'INSPECTION_STARTED', {
        reason:
          a.trigger === 'OPERATOR_DIRECT'
            ? 'Operator requested remote inspection; no local navigation interception is asserted.'
            : a.trigger,
      });
      let result: InspectionResult;
      try {
        result = InspectionResultSchema.parse(await this.options.inspector.inspect(fixtureId));
        if (result.mode !== this.options.inspectionMode) throw new Error('Provider mode mismatch');
        if (this.options.inspectionSource && result.source !== this.options.inspectionSource)
          throw new Error('Provider source mismatch');
      } catch {
        result = {
          execution: 'UNAVAILABLE',
          mode: this.options.inspectionMode,
          observation: null,
          pngBase64: null,
          source: this.options.inspectionSource ?? 'VERCEL_SANDBOX',
          sandboxId: null,
          createdAt: null,
          collectionStartedAt: null,
          returnedAt: iso(),
          cleanup: { ...emptyCleanup(), state: 'UNRESOLVED' },
          failure: 'PROVIDER_UNAVAILABLE',
        };
      }
      a.link = assessLink(
        result,
        a.link.timing.heldAt,
        runId,
        this.options.approvedIdpOrigins,
        this.options.workflow === 'DETECTOR',
      );
      if (a.link.execution === 'SUCCEEDED' && result.pngBase64)
        a.png = Buffer.from(result.pngBase64, 'base64');
      if (this.options.workflow === 'DETECTOR')
        a.link = applyReleasePolicy(a.link, this.options.releasePolicy, a.trigger);
      this.event(
        a,
        a.link.decision === 'RELEASE'
          ? 'POLICY_RELEASE_GRANTED'
          : a.link.decision === 'REVIEW'
            ? 'REVIEW_REQUIRED'
            : 'LINK_BLOCKED',
        { reason: a.link.classification },
      );
      if (a.link.cleanup.state === 'UNRESOLVED') this.event(a, 'CLEANUP_UNRESOLVED');
      if (this.options.workflow === 'DETECTOR' || a.link.classification !== 'SUSPICIOUS') {
        a.execution =
          a.link.decision === 'RELEASE'
            ? 'RELEASE_READY'
            : a.link.decision === 'REVIEW'
              ? 'REVIEW'
              : 'BLOCKED';
        return;
      }
      a.session.observations = a.environment.initialObservations(a.session.identity);
      a.initialStateHash = createHash('sha256')
        .update(JSON.stringify(buildPlannerView(a.session, this.assess(a))))
        .digest('hex');
      this.event(a, 'SCENARIO_STARTED', {
        reason: 'Authorized synthetic assumed-compromise case; compromise was not observed.',
      });
      await this.investigate(a);
    });
  }
  continue(runId: string, requestId: string, revision: number): Promise<CaseSnapshot> {
    if (this.options.workflow === 'DETECTOR')
      throw new CommandError('SYNTHETIC_WORKFLOW_DISABLED', 403);
    return this.command(runId, requestId, `continue:${revision}`, async (a) => {
      if (revision !== a.session.identity.revision) throw new CommandError('STALE_REVISION');
      if (a.change || !a.session.authorization || a.link.classification !== 'SUSPICIOUS')
        throw new CommandError('INVESTIGATION_NOT_ELIGIBLE');
      if (!['PAUSED', 'STOPPED', 'MODEL_UNAVAILABLE'].includes(a.execution))
        throw new CommandError('INVESTIGATION_NOT_ELIGIBLE');
      await this.investigate(a);
    });
  }
  harden(runId: string, requestId: string, revision: number): Promise<CaseSnapshot> {
    if (this.options.workflow === 'DETECTOR')
      throw new CommandError('SYNTHETIC_WORKFLOW_DISABLED', 403);
    return this.command(runId, requestId, `harden:${revision}`, async (a) => {
      if (revision !== a.session.identity.revision) throw new CommandError('STALE_REVISION');
      if (
        a.change ||
        !a.session.authorization ||
        a.link.classification !== 'SUSPICIOUS' ||
        !['PAUSED', 'STOPPED', 'MODEL_UNAVAILABLE'].includes(a.execution)
      )
        throw new CommandError('CHANGE_NOT_ELIGIBLE');
      const before = this.assess(a);
      a.baseline = structuredClone({
        revision,
        assessments: before,
        observations: a.session.observations,
      });
      const changed = a.environment.applyChange(
        a.session.identity,
        a.session.authorization,
        a.session.observations,
      );
      a.session.identity = changed.identity;
      a.session.observations = changed.observations;
      a.change = changed.change;
      a.verification = 'REQUIRED';
      a.execution = 'VERIFICATION_PENDING';
      this.event(a, 'CHANGE_APPLIED', { referenceId: changed.change.id });
      // Deliberately separate the write from the paid observation. Polling can inspect this state.
    });
  }
  verify(runId: string, requestId: string, revision: number): Promise<CaseSnapshot> {
    if (this.options.workflow === 'DETECTOR')
      throw new CommandError('SYNTHETIC_WORKFLOW_DISABLED', 403);
    return this.command(runId, requestId, `verify:${revision}`, async (a) => {
      if (revision !== a.session.identity.revision) throw new CommandError('STALE_REVISION');
      if (!a.change || a.verification !== 'REQUIRED')
        throw new CommandError('VERIFICATION_NOT_ELIGIBLE');
      a.execution = 'VERIFYING';
      a.verification = 'RUNNING';
      this.event(a, 'VERIFICATION_STARTED');
      const receipt = await a.broker.execute({
        requestId: id('verify'),
        revision,
        origin: 'OPERATOR_VERIFICATION',
        actionId: 'INV-JENKINS-CLI',
        target: 'Jenkins-02',
        rationale: 'Acquire fresh effective availability after the authorized synthetic change.',
      });
      this.event(a, 'BROKER_COMPLETED', {
        referenceId: receipt.requestId,
        actionId: receipt.actionId,
        observationIds: receipt.observationIds,
        reason: receipt.reason,
      });
      const jenkins = this.assess(a).find((x) => x.hypothesisId === 'HYP-002');
      const verified =
        receipt.accepted &&
        receipt.reason === 'COLLECTED' &&
        jenkins?.outcome === 'DISMISSED' &&
        jenkins.falsifyingObservationIds.some((ref) => receipt.observationIds.includes(ref));
      a.verification = verified ? 'VERIFIED' : 'GAP';
      a.execution = 'COMPLETE';
      this.event(a, verified ? 'VERIFICATION_COMPLETED' : 'VERIFICATION_GAP', {
        referenceId: receipt.requestId,
      });
    });
  }
  snapshot(runId: string): CaseSnapshot {
    const a = this.get(runId);
    const assessments = this.options.workflow === 'DETECTOR' ? [] : this.assess(a);
    const summary = {
      retained: assessments.filter((h) => h.outcome === 'RETAINED').length,
      dismissed: assessments.filter((h) => h.outcome === 'DISMISSED').length,
      inconclusive: assessments.filter((h) => h.outcome === 'INCONCLUSIVE').length,
      verifiedAfterState:
        a.verification === 'VERIFIED' && assessments.every((h) => h.outcome === 'DISMISSED'),
    };
    return CaseSnapshotSchema.parse({
      workflow: this.options.workflow ?? 'SYNTHETIC',
      inspectionTrigger: a.trigger,
      identity: a.session.identity,
      scenarioVersion: SCENARIO_VERSION,
      principal: 'Apprentice-07',
      modes: {
        inspection: this.options.inspectionMode,
        planner: this.options.plannerMode,
        organization: 'SYNTHETIC_ORGANIZATION',
      },
      authorization: a.session.authorization,
      execution: a.execution,
      link: a.link,
      observations: a.session.observations,
      assessments,
      baseline: a.baseline,
      change: a.change,
      verification: a.verification,
      budget: a.session.budget,
      catalog: a.session.catalog,
      brokerReceipts: a.session.receipts,
      events: a.events,
      access: deriveAccess(a.session.identity, a.session.observations, undefined, {
        change: a.change ?? undefined,
        receipts: a.session.receipts,
      }),
      summary,
    });
  }
  image(runId: string): Buffer {
    const png = this.get(runId).png;
    if (!png) throw new CommandError('IMAGE_UNAVAILABLE', 404);
    return Buffer.from(png);
  }
  receipt(runId: string): CaseReceipt {
    const snapshot = this.snapshot(runId);
    const body = {
      receiptVersion: CONTRACT_VERSION,
      exportedAt: iso(),
      snapshot,
      claims: {
        exploitAttempts: 0 as const,
        credentialsSubmitted: false as const,
        compromiseObserved: false as const,
        consequenceDemonstrated: false as const,
        endpointInterceptionVerified: false as const,
        productionScaleVerified: false as const,
      },
      limitations: [
        ...(this.options.workflow === 'DETECTOR'
          ? [
              DETECTION_LIMITS,
              'Direct operator inspection is not proof of local navigation interception. Astra is not invoked.',
              'Solari browser routing is not a verified infrastructure egress firewall. Owned inert fixtures only.',
              'Confirmed cleanup means accepted termination plus absence from exact-tag authenticated resource inventory, not erasure of provider logs.',
            ]
          : []),
        'Synthetic organization observations are separate from remote page inspection.',
        'No exploitation, authentication attempt, service takeover or downstream compromise was demonstrated.',
        'A declared form destination does not establish all JavaScript network behavior.',
        'Endpoint interception and the integrated live route require a separate measured acceptance run.',
        'The local in-memory controller is a shared administrative authority; no multi-tenant or scale claim is verified.',
        'The digest binds exported bytes but is not an independent signature or attestation.',
        ...(this.options.inspectionMode !== 'LIVE' || this.options.plannerMode !== 'LIVE'
          ? [
              'MOCK/REPLAY components cannot establish live provider or Astra behavior; inspect the per-component mode and workflow.',
            ]
          : []),
      ],
    };
    return CaseReceiptSchema.parse({
      ...body,
      digest: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    });
  }
  private async investigate(a: Attempt): Promise<void> {
    if (!a.session.authorization || a.link.classification !== 'SUSPICIOUS')
      throw new CommandError('BLOCK_AND_AUTHORIZATION_REQUIRED');
    a.execution = 'INVESTIGATING';
    // Every action consumes >=1; bounds also protect against repeated invalid or zero-cost requests.
    for (let step = 0; step < 6; step++) {
      if (a.session.budget.remaining < 1) {
        a.execution = 'STOPPED';
        return;
      }
      const view = buildPlannerView(a.session, this.assess(a));
      this.event(a, 'PLANNER_DISPATCHED');
      let decision;
      try {
        decision = InvestigationDecisionSchema.parse(await this.options.planner.choose(view));
      } catch {
        a.execution = 'MODEL_UNAVAILABLE';
        this.event(a, 'PLANNER_FAILED', {
          reason: 'Model request failed; no substitute decision or evidence was created.',
        });
        return;
      }
      this.event(a, 'PLANNER_DECIDED', {
        ...(decision.type === 'INVESTIGATE' ? { actionId: decision.actionId } : {}),
        reason: decision.rationale.replace(/[\u0000-\u001f]/g, ' ').slice(0, 240),
      });
      if (decision.type === 'STOP') {
        a.execution = 'STOPPED';
        this.event(a, 'PLANNER_STOPPED');
        return;
      }
      const receipt = await a.broker.execute({
        requestId: id('request'),
        revision: a.session.identity.revision,
        origin: 'ASTRA',
        actionId: decision.actionId,
        target: decision.target,
        rationale: decision.rationale,
      });
      this.event(a, 'BROKER_COMPLETED', {
        referenceId: receipt.requestId,
        actionId: receipt.actionId,
        observationIds: receipt.observationIds,
        reason: receipt.reason,
      });
      if (!receipt.accepted || receipt.reason !== 'COLLECTED') {
        a.execution = 'PAUSED';
        return;
      }
    }
    a.execution = 'PAUSED';
  }
  private assess(a: Attempt): Assessment[] {
    return evaluate(
      a.session.identity,
      a.session.observations,
      a.session.authorization,
      undefined,
      { change: a.change ?? undefined, receipts: a.session.receipts },
    );
  }
  private get(runId: string): Attempt {
    const a = this.attempts.get(runId);
    if (!a) throw new CommandError('ATTEMPT_NOT_FOUND', 404);
    return a;
  }
  private event(a: Attempt, type: EventType, payload: CaseEvent['payload'] = {}): void {
    a.events.push(
      CaseEventSchema.parse({
        sequence: a.events.length + 1,
        runId: a.session.identity.runId,
        revision: a.session.identity.revision,
        type,
        at: iso(),
        payload,
      }),
    );
  }
  private command(
    runId: string,
    requestId: string,
    signature: string,
    action: (a: Attempt) => Promise<void>,
  ): Promise<CaseSnapshot> {
    const a = this.get(runId);
    const prior = a.commands.get(requestId);
    if (prior) {
      if (prior.signature !== signature)
        return Promise.reject(new CommandError('IDEMPOTENCY_CONFLICT'));
      return prior.result;
    }
    if (a.busy) return Promise.reject(new CommandError('ATTEMPT_BUSY'));
    if (a.commands.size >= 64) return Promise.reject(new CommandError('COMMAND_LIMIT', 429));
    a.busy = true;
    const result = Promise.resolve()
      .then(() => action(a))
      .then(() => this.snapshot(runId))
      .finally(() => {
        a.busy = false;
      });
    a.commands.set(requestId, { signature, result });
    return result;
  }
}

export function assessLink(
  result: InspectionResult,
  heldAt: string,
  runId: string,
  idpOrigins: string[],
  detector = false,
): LinkAssessment {
  const base = {
    execution: result.execution,
    mode: result.mode,
    decision: 'BLOCK' as const,
    source: result.source,
    cleanup: result.cleanup,
    ...(result.session ? { session: result.session } : {}),
    timing: {
      heldAt,
      createdAt: result.createdAt,
      collectionStartedAt: result.collectionStartedAt,
      returnedAt: result.returnedAt,
      blockedAt: iso(),
    },
  };
  const png = result.pngBase64 ? Buffer.from(result.pngBase64, 'base64') : null;
  const pngValid = png && validPng(png);
  const times = [
    heldAt,
    result.createdAt,
    result.collectionStartedAt,
    result.observation?.observedAt,
    result.returnedAt,
  ].map((value) => (value ? Date.parse(value) : NaN));
  const ordered = (values: number[]) =>
    values.every(Number.isFinite) &&
    values.slice(1).every((time, index) => time + 5000 >= values[index]!);
  const orderedTimes = result.session
    ? result.source === 'SOLARI_SANDBOX' &&
      detector &&
      Date.parse(heldAt) <= Date.parse(result.session.acquiredAt) + 5000 &&
      ordered([
        Date.parse(result.createdAt ?? ''),
        Date.parse(result.session.readyAt),
        Date.parse(result.session.acquiredAt),
        Date.parse(result.collectionStartedAt ?? ''),
        Date.parse(result.observation?.observedAt ?? ''),
        Date.parse(result.returnedAt),
      ]) &&
      (result.cleanup.state === 'RETAINED'
        ? result.session.disposition === 'RETAINED' &&
          result.cleanup.stoppedAt === null &&
          result.cleanup.deletedAt === null
        : result.session.disposition === 'RETIRED')
    : result.cleanup.state !== 'RETAINED' && ordered(times);
  const successMetadata =
    result.sandboxId !== null &&
    result.cleanup.sandboxId === result.sandboxId &&
    result.cleanup.state !== 'NOT_CREATED' &&
    result.failure === null &&
    !(
      result.cleanup.state === 'RETAINED' &&
      result.observation &&
      detectThreats(result.observation, idpOrigins).length > 0
    ) &&
    orderedTimes;
  if (result.execution !== 'SUCCEEDED' || !result.observation || !pngValid || !successMetadata)
    return {
      ...base,
      execution: 'UNAVAILABLE',
      classification: 'INSPECTION_UNAVAILABLE',
      ruleIds: [],
      findings: [],
      observation: null,
      imagePath: null,
      failure: result.failure ?? 'INVALID_EVIDENCE',
    };
  const observation = result.observation;
  const ruleIds: LinkAssessment['ruleIds'] = [];
  if (observation.passwordField) ruleIds.push('AUTH-01');
  let destination: string | null = null;
  try {
    destination =
      observation.formAction === null
        ? null
        : new URL(observation.formAction, observation.finalUrl).origin;
  } catch {
    /* An invalid action cannot manufacture AUTH-02. */
  }
  const approved = idpOrigins.map((origin) => new URL(origin).origin);
  if (
    (observation.claimedService === 'ACME' || observation.claimedService === 'AIONPHISH') &&
    destination &&
    destination !== 'null' &&
    destination === observation.formDestinationOrigin &&
    !approved.includes(destination)
  )
    ruleIds.push('AUTH-02');
  const findings = detector ? detectThreats(observation, idpOrigins) : [];
  return {
    ...base,
    findings,
    classification: (detector ? findings.length > 0 : ruleIds.length === 2)
      ? 'SUSPICIOUS'
      : 'UNDETERMINED',
    ruleIds: detector ? findings.map((f) => f.ruleId) : ruleIds,
    observation,
    imagePath: `/api/attempts/${runId}/image`,
    failure: null,
  };
}
