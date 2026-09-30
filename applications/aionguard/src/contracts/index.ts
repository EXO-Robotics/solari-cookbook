import { z } from 'zod';

export const CONTRACT_VERSION = '1.0.0' as const;
export const SCENARIO_VERSION = 'acme-1' as const;
export const ModeSchema = z.enum(['LIVE', 'MOCK', 'REPLAY']);
export type Mode = z.infer<typeof ModeSchema>;
export const IdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const TimestampSchema = z.iso.datetime();
export const CaseIdentitySchema = z
  .object({
    schemaVersion: z.literal(CONTRACT_VERSION),
    caseId: z.literal('PR-014'),
    runId: IdSchema,
    attemptId: IdSchema,
    ledgerId: IdSchema,
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type CaseIdentity = z.infer<typeof CaseIdentitySchema>;
export const AssumptionSchema = z.enum([
  'FRESH_AUTH_REQUIRED',
  'DISABLED_STATUS_ENFORCED',
  'NO_SURVIVING_SESSION_OR_ALTERNATE_CREDENTIAL',
]);
export const ASSUMPTIONS = AssumptionSchema.options;
const SyntheticAuthorizationSchema = z
  .object({
    id: IdSchema,
    at: TimestampSchema,
    scenario: z.literal('SYNTHETIC_ASSUMED_COMPROMISE'),
    principal: z.literal('Apprentice-07'),
    assumptions: z.array(AssumptionSchema).length(3),
    change: z.literal('jenkins.cli_enabled:true->false'),
  })
  .strict();
export const AuthorizationSchema = z.union([
  SyntheticAuthorizationSchema,
  z
    .object({
      id: IdSchema,
      at: TimestampSchema,
      principal: z.literal('Apprentice-07'),
      scenario: z.literal('OWNED_FIXTURE_INSPECTION'),
      assumptions: z.array(AssumptionSchema).length(0),
      change: z.literal('NONE'),
    })
    .strict(),
]);
export type Authorization = z.infer<typeof AuthorizationSchema>;

export const SubjectSchema = z.enum([
  'Apprentice-07',
  'Internal Wiki',
  'Git Metadata',
  'Engineering Share',
  'Jenkins-02',
  'legacy-prod-secrets',
  'Finance Admin',
  'Production',
  'prod-admin-legacy',
  'ci-service',
  'Staging',
]);
export type Subject = z.infer<typeof SubjectSchema>;
export const PredicateSchema = z.enum([
  'direct_access',
  'legacy_reference',
  'product',
  'principal_status',
  'last_auth_days',
  'runtime_identity',
  'jenkins_version',
  'cli_available',
  'staging_grant',
  'artifact_metadata',
  'production_map',
  'credential_age_days',
  'plugins',
]);
export type Predicate = z.infer<typeof PredicateSchema>;
const observationBase = {
  id: IdSchema,
  runId: IdSchema,
  caseId: z.literal('PR-014'),
  revision: z.number().int().nonnegative(),
  subject: SubjectSchema,
  domain: z.literal('SYNTHETIC_ORGANIZATION'),
  source: z
    .object({
      kind: z.enum(['INITIAL_INVENTORY', 'SYNTHETIC_COLLECTOR']),
      reference: IdSchema,
      authority: z.enum(['AUTHORITATIVE', 'CONTEXT']),
      actionId: z
        .string()
        .regex(/^INV-[A-Z-]+$/)
        .nullable(),
    })
    .strict(),
  observedAt: TimestampSchema,
  validity: z
    .object({
      current: z.boolean(),
      validUntil: TimestampSchema,
      scope: z.literal('PR-014'),
      completeness: z.enum(['COMPLETE', 'INCOMPLETE']),
      carriedFrom: z
        .object({
          observationId: IdSchema,
          revision: z.number().int().nonnegative(),
          changeId: IdSchema,
        })
        .strict()
        .nullable(),
    })
    .strict(),
};
export const ObservationSchema = z.discriminatedUnion('predicate', [
  z
    .object({
      ...observationBase,
      predicate: z.literal('direct_access'),
      value: z.enum(['REACHABLE', 'BLOCKED']),
    })
    .strict(),
  z
    .object({
      ...observationBase,
      predicate: z.literal('legacy_reference'),
      value: z.literal('prod-admin-legacy'),
    })
    .strict(),
  z
    .object({ ...observationBase, predicate: z.literal('product'), value: z.literal('Jenkins') })
    .strict(),
  z
    .object({
      ...observationBase,
      predicate: z.literal('principal_status'),
      value: z.enum(['ACTIVE', 'DISABLED']),
    })
    .strict(),
  z
    .object({
      ...observationBase,
      predicate: z.literal('last_auth_days'),
      value: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      ...observationBase,
      predicate: z.literal('runtime_identity'),
      value: z.literal('ci-service'),
    })
    .strict(),
  z
    .object({
      ...observationBase,
      predicate: z.literal('jenkins_version'),
      value: z.string().regex(/^\d{1,3}\.\d{1,4}(?:\.\d{1,3})?$/),
    })
    .strict(),
  z
    .object({ ...observationBase, predicate: z.literal('cli_available'), value: z.boolean() })
    .strict(),
  z
    .object({ ...observationBase, predicate: z.literal('staging_grant'), value: z.boolean() })
    .strict(),
  z
    .object({
      ...observationBase,
      predicate: z.literal('artifact_metadata'),
      value: z.literal('REFERENCE_ONLY_NO_SECRET'),
    })
    .strict(),
  z
    .object({
      ...observationBase,
      predicate: z.literal('production_map'),
      value: z.literal('AUTHORITY_NOT_ESTABLISHED'),
    })
    .strict(),
  z
    .object({
      ...observationBase,
      predicate: z.literal('credential_age_days'),
      value: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      ...observationBase,
      predicate: z.literal('plugins'),
      value: z.array(z.enum(['git', 'workflow-aggregator'])).max(2),
    })
    .strict(),
]);
export type Observation = z.infer<typeof ObservationSchema>;
export const HypothesisIdSchema = z.enum(['HYP-001', 'HYP-002']);
export type HypothesisId = z.infer<typeof HypothesisIdSchema>;
export const HypothesisDefinitionSchema = z
  .object({
    id: HypothesisIdSchema,
    title: z.string(),
    impact: z.enum(['CRITICAL', 'HIGH']),
    requiredPredicates: z.array(PredicateSchema),
    assumptions: z.array(AssumptionSchema),
    advisory: z.literal('CVE-2024-23897').nullable(),
  })
  .strict();
export type HypothesisDefinition = z.infer<typeof HypothesisDefinitionSchema>;
export const ActionIdSchema = z.enum([
  'INV-SECRET-METADATA',
  'INV-PRINCIPAL-STATUS',
  'INV-PRODUCTION-MAP',
  'INV-CREDENTIAL-AGE',
  'INV-ACTIVITY-LEDGER',
  'INV-JENKINS-PLUGINS',
  'INV-JENKINS-CLI',
  'INV-ASSET-INVENTORY',
  'INV-JENKINS-VERSION',
]);
export type ActionId = z.infer<typeof ActionIdSchema>;
export const InvestigationDefinitionSchema = z
  .object({
    id: ActionIdSchema,
    label: z.string(),
    cost: z.union([z.literal(1), z.literal(2)]),
    target: SubjectSchema,
    coverage: z.array(PredicateSchema),
    hypotheses: z.array(HypothesisIdSchema),
    sourceCurrent: z.boolean(),
    sourceComplete: z.boolean(),
    order: z.number().int().nonnegative(),
  })
  .strict();
export type InvestigationDefinition = z.infer<typeof InvestigationDefinitionSchema>;
export const AssessmentSchema = z
  .object({
    hypothesisId: HypothesisIdSchema,
    impact: z.enum(['CRITICAL', 'HIGH']),
    outcome: z.enum(['RETAINED', 'DISMISSED', 'INCONCLUSIVE']),
    depth: z.number().int().min(0).max(4).nullable(),
    ruleIds: z.array(IdSchema),
    supportingObservationIds: z.array(IdSchema),
    falsifyingObservationIds: z.array(IdSchema),
    gaps: z.array(z.string().max(240)),
    consequenceValidated: z.literal(false),
  })
  .strict();
export type Assessment = z.infer<typeof AssessmentSchema>;
export const BudgetSchema = z
  .object({
    total: z.literal(4),
    spent: z.number().int().min(0).max(4),
    remaining: z.number().int().min(0).max(4),
  })
  .strict()
  .refine((b) => b.spent + b.remaining === b.total);
export type Budget = z.infer<typeof BudgetSchema>;
export const InvestigationDecisionSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('INVESTIGATE'),
      actionId: ActionIdSchema,
      target: SubjectSchema,
      hypothesisIds: z.array(HypothesisIdSchema).min(1).max(2),
      rationale: z.string().min(1).max(400),
    })
    .strict(),
  z.object({ type: z.literal('STOP'), rationale: z.string().min(1).max(400) }).strict(),
]);
export type InvestigationDecision = z.infer<typeof InvestigationDecisionSchema>;
export const BrokerRequestSchema = z
  .object({
    requestId: IdSchema,
    revision: z.number().int().nonnegative(),
    origin: z.enum(['ASTRA', 'BASELINE_GREEDY', 'BASELINE_COVERAGE', 'OPERATOR_VERIFICATION']),
    actionId: ActionIdSchema,
    target: SubjectSchema,
    rationale: z.string().min(1).max(400),
  })
  .strict();
export type BrokerRequest = z.infer<typeof BrokerRequestSchema>;
export const BrokerReceiptSchema = z
  .object({
    requestId: IdSchema,
    revision: z.number().int().nonnegative(),
    origin: BrokerRequestSchema.shape.origin,
    actionId: ActionIdSchema,
    target: SubjectSchema,
    accepted: z.boolean(),
    reason: z.enum([
      'COLLECTED',
      'COLLECTION_FAILED',
      'INVALID_REQUEST',
      'STALE_REVISION',
      'IDEMPOTENCY_CONFLICT',
      'INSUFFICIENT_BUDGET',
      'UNAUTHORIZED',
      'INELIGIBLE',
    ]),
    cost: z.number().int().min(0).max(2),
    budgetBefore: z.number().int().min(0).max(4),
    budgetAfter: z.number().int().min(0).max(4),
    observationIds: z.array(IdSchema),
    at: TimestampSchema,
  })
  .strict();
export type BrokerReceipt = z.infer<typeof BrokerReceiptSchema>;

// Provider input is rebuilt from fixed internal facts. Inspection strings never belong here.
export const PlannerFactSchema = z
  .object({
    id: IdSchema,
    subject: SubjectSchema,
    predicate: PredicateSchema,
    value: z.union([z.boolean(), z.number(), z.string(), z.array(z.string())]),
    current: z.boolean(),
    complete: z.boolean(),
    authoritative: z.boolean(),
  })
  .strict();
export const PlannerViewSchema = z
  .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    scenarioVersion: z.literal(SCENARIO_VERSION),
    caseId: z.literal('PR-014'),
    revision: z.number().int().nonnegative(),
    linkOutcome: z.literal('SUSPICIOUS_BLOCK'),
    objective: z.literal('ASSESS_BOTH_PRESERVE_ONE_CREDIT_FOR_FRESH_VERIFICATION'),
    assumptions: z.array(AssumptionSchema),
    facts: z.array(PlannerFactSchema),
    assessments: z.array(AssessmentSchema),
    catalog: z.array(InvestigationDefinitionSchema),
    budget: BudgetSchema,
    completedActionIds: z.array(ActionIdSchema),
  })
  .strict();
export type PlannerView = z.infer<typeof PlannerViewSchema>;
export type Planner = { choose(view: PlannerView): Promise<InvestigationDecision> };
export const ScenarioVariantSchema = z.enum(['CANONICAL', 'RUNTIME_KNOWN', 'LEDGER_STALE']);
export type ScenarioVariant = z.infer<typeof ScenarioVariantSchema>;
export interface InvestigationSession {
  identity: CaseIdentity;
  authorization: Authorization | null;
  observations: Observation[];
  receipts: BrokerReceipt[];
  budget: Budget;
  catalog: InvestigationDefinition[];
}
export type Collector = (
  action: InvestigationDefinition,
  identity: CaseIdentity,
) => Promise<Observation[]>;

export const CleanupSchema = z
  .object({
    state: z.enum(['NOT_CREATED', 'PENDING', 'CONFIRMED', 'UNRESOLVED', 'RETAINED']),
    sandboxId: IdSchema.nullable(),
    stoppedAt: TimestampSchema.nullable(),
    deletedAt: TimestampSchema.nullable(),
  })
  .strict();
export type Cleanup = z.infer<typeof CleanupSchema>;
export const InspectionObservationSchema = z
  .object({
    finalUrl: z.url().max(2048),
    title: z.string().max(200),
    text: z.string().max(1000),
    claimedService: z.enum(['ACME', 'AIONPHISH', 'UNKNOWN']),
    downloadLinks: z
      .array(z.object({ href: z.string().max(2048), text: z.string().max(200) }).strict())
      .max(20)
      .optional(),
    passwordField: z.boolean(),
    formAction: z.string().max(2048).nullable(),
    formDestinationOrigin: z.url().max(2048).nullable(),
    redirects: z.array(z.url().max(2048)).max(10),
    observedAt: TimestampSchema,
  })
  .strict();
export type InspectionObservation = z.infer<typeof InspectionObservationSchema>;
export const WarmSessionSchema = z
  .object({
    mode: z.literal('WARM'),
    readyAt: TimestampSchema,
    acquiredAt: TimestampSchema,
    reused: z.boolean(),
    inspectionCount: z.number().int().min(1).max(1000),
    disposition: z.enum(['RETAINED', 'RETIRED']),
  })
  .strict();
export const WarmPoolStatusSchema = z
  .object({
    state: z.enum([
      'DISABLED',
      'EMPTY',
      'PREPARING',
      'READY',
      'INSPECTING',
      'RETIRING',
      'BLOCKED',
      'CLOSED',
    ]),
    sandboxId: IdSchema.nullable(),
    readyAt: TimestampSchema.nullable(),
    expiresAt: TimestampSchema.nullable(),
    inspectionCount: z.number().int().nonnegative(),
    cleanupUnresolved: z.number().int().nonnegative(),
    lastError: z.string().max(100).nullable(),
  })
  .strict();
export type WarmPoolStatus = z.infer<typeof WarmPoolStatusSchema>;
export const InspectionResultSchema = z
  .object({
    execution: z.enum(['SUCCEEDED', 'UNAVAILABLE']),
    mode: ModeSchema,
    observation: InspectionObservationSchema.nullable(),
    pngBase64: z.string().max(4_000_000).nullable(),
    source: z.enum(['VERCEL_SANDBOX', 'SOLARI_SANDBOX']),
    sandboxId: IdSchema.nullable(),
    createdAt: TimestampSchema.nullable(),
    collectionStartedAt: TimestampSchema.nullable(),
    returnedAt: TimestampSchema,
    cleanup: CleanupSchema,
    session: WarmSessionSchema.optional(),
    failure: z
      .enum([
        'NOT_CONFIGURED',
        'CAPACITY',
        'PROVIDER_UNAVAILABLE',
        'NAVIGATION_DENIED',
        'TIMEOUT',
        'INVALID_EVIDENCE',
      ])
      .nullable(),
  })
  .strict();
export type InspectionResult = z.infer<typeof InspectionResultSchema>;
export interface Inspector {
  inspect(fixtureId: string): Promise<InspectionResult>;
}
export const ThreatFindingSchema = z
  .object({
    category: z.enum([
      'CREDENTIAL_PHISHING',
      'CROSS_ORIGIN_CREDENTIAL_SUBMISSION',
      'EXECUTABLE_DOWNLOAD_LURE',
      'TECH_SUPPORT_SCAM',
      'CLICKFIX',
    ]),
    ruleId: z.string().max(40),
    summary: z.string().max(500),
    evidence: z.array(z.string().max(2500)).max(10),
    limitation: z.string().max(1000),
  })
  .strict();
export const LinkAssessmentSchema = z
  .object({
    execution: z.enum(['PENDING', 'SUCCEEDED', 'UNAVAILABLE']),
    classification: z.enum(['PENDING', 'SUSPICIOUS', 'INSPECTION_UNAVAILABLE', 'UNDETERMINED']),
    decision: z.enum(['BLOCK', 'REVIEW', 'RELEASE']),
    release: z
      .object({
        url: z.url().max(2048),
        expiresAt: TimestampSchema,
        policy: z.literal('NO_FINDINGS_V1'),
      })
      .strict()
      .optional(),
    ruleIds: z.array(z.string().max(40)),
    findings: z.array(ThreatFindingSchema).max(5).default([]),
    mode: ModeSchema,
    observation: InspectionObservationSchema.nullable(),
    imagePath: z
      .string()
      .regex(/^\/api\/attempts\/[a-zA-Z0-9_-]+\/image$/)
      .nullable(),
    cleanup: CleanupSchema,
    session: WarmSessionSchema.optional(),
    source: z.enum(['VERCEL_SANDBOX', 'SOLARI_SANDBOX']),
    failure: InspectionResultSchema.shape.failure,
    timing: z
      .object({
        heldAt: TimestampSchema,
        createdAt: TimestampSchema.nullable(),
        collectionStartedAt: TimestampSchema.nullable(),
        returnedAt: TimestampSchema.nullable(),
        blockedAt: TimestampSchema.nullable(),
      })
      .strict(),
  })
  .strict();
export type LinkAssessment = z.infer<typeof LinkAssessmentSchema>;
export const ChangeSchema = z
  .object({
    id: IdSchema,
    authorizedBy: IdSchema,
    at: TimestampSchema,
    fromRevision: z.number().int().nonnegative(),
    toRevision: z.number().int().positive(),
    field: z.literal('jenkins.cli_enabled'),
    before: z.literal(true),
    after: z.literal(false),
    invalidatedObservationIds: z.array(IdSchema),
    carriedObservationIds: z.array(IdSchema),
  })
  .strict();
export type Change = z.infer<typeof ChangeSchema>;
export const EventTypeSchema = z.enum([
  'ATTEMPT_CREATED',
  'AUTHORIZED',
  'NAVIGATION_HELD',
  'INSPECTION_STARTED',
  'LINK_BLOCKED',
  'REVIEW_REQUIRED',
  'POLICY_RELEASE_GRANTED',
  'SCENARIO_STARTED',
  'PLANNER_DISPATCHED',
  'PLANNER_DECIDED',
  'PLANNER_STOPPED',
  'PLANNER_FAILED',
  'BROKER_COMPLETED',
  'CHANGE_APPLIED',
  'VERIFICATION_STARTED',
  'VERIFICATION_COMPLETED',
  'VERIFICATION_GAP',
  'CLEANUP_UNRESOLVED',
]);
export type EventType = z.infer<typeof EventTypeSchema>;
export const CaseEventSchema = z
  .object({
    sequence: z.number().int().positive(),
    runId: IdSchema,
    revision: z.number().int().nonnegative(),
    type: EventTypeSchema,
    at: TimestampSchema,
    payload: z
      .object({
        referenceId: IdSchema.optional(),
        actionId: ActionIdSchema.optional(),
        observationIds: z.array(IdSchema).optional(),
        reason: z.string().max(240).optional(),
      })
      .strict(),
  })
  .strict();
export type CaseEvent = z.infer<typeof CaseEventSchema>;
export const ExecutionSchema = z.enum([
  'READY',
  'INSPECTING',
  'INVESTIGATING',
  'PAUSED',
  'STOPPED',
  'MODEL_UNAVAILABLE',
  'VERIFICATION_PENDING',
  'VERIFYING',
  'COMPLETE',
  'BLOCKED',
  'REVIEW',
  'RELEASE_READY',
]);
export const CaseSnapshotSchema = z
  .object({
    workflow: z.enum(['DETECTOR', 'SYNTHETIC']).default('SYNTHETIC'),
    inspectionTrigger: z
      .enum(['NOT_STARTED', 'OPERATOR_DIRECT', 'SAFARI_HANDOFF', 'CHROME_HANDOFF', 'MOCK'])
      .default('NOT_STARTED'),
    identity: CaseIdentitySchema,
    scenarioVersion: z.literal(SCENARIO_VERSION),
    principal: z.literal('Apprentice-07'),
    modes: z
      .object({
        inspection: ModeSchema,
        planner: ModeSchema,
        organization: z.literal('SYNTHETIC_ORGANIZATION'),
      })
      .strict(),
    authorization: AuthorizationSchema.nullable(),
    execution: ExecutionSchema,
    link: LinkAssessmentSchema,
    observations: z.array(ObservationSchema),
    assessments: z.array(AssessmentSchema),
    baseline: z
      .object({
        revision: z.number().int().nonnegative(),
        assessments: z.array(AssessmentSchema),
        observations: z.array(ObservationSchema),
      })
      .strict()
      .nullable(),
    change: ChangeSchema.nullable(),
    verification: z.enum(['NOT_REQUESTED', 'REQUIRED', 'RUNNING', 'VERIFIED', 'GAP']),
    budget: BudgetSchema,
    catalog: z.array(InvestigationDefinitionSchema),
    brokerReceipts: z.array(BrokerReceiptSchema),
    events: z.array(CaseEventSchema),
    access: z
      .object({
        reachable: z.number().int().nonnegative(),
        blocked: z.number().int().nonnegative(),
      })
      .strict(),
    summary: z
      .object({
        retained: z.number().int().nonnegative(),
        dismissed: z.number().int().nonnegative(),
        inconclusive: z.number().int().nonnegative(),
        verifiedAfterState: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type CaseSnapshot = z.infer<typeof CaseSnapshotSchema>;
export const CaseReceiptSchema = z
  .object({
    receiptVersion: z.literal(CONTRACT_VERSION),
    exportedAt: TimestampSchema,
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    snapshot: CaseSnapshotSchema,
    claims: z
      .object({
        exploitAttempts: z.literal(0),
        credentialsSubmitted: z.literal(false),
        compromiseObserved: z.literal(false),
        consequenceDemonstrated: z.literal(false),
        endpointInterceptionVerified: z.literal(false),
        productionScaleVerified: z.literal(false),
      })
      .strict(),
    limitations: z.array(z.string()),
  })
  .strict();
export type CaseReceipt = z.infer<typeof CaseReceiptSchema>;

export const ComparisonRowSchema = z.object({
  plannerId: z.enum(['GREEDY', 'COVERAGE', 'ASTRA']),
  policyVersion: z.string(),
  model: z.string().nullable(),
  mode: z.enum(['LIVE', 'MOCK']),
  initialStateHash: z.string().regex(/^[a-f0-9]{64}$/),
  scenarioVersion: z.literal(SCENARIO_VERSION),
  actionContractVersion: z.literal('actions-1'),
  status: z.enum(['COMPLETED', 'PLANNER_FAILED', 'STEP_LIMIT', 'VERIFICATION_FAILED']),
  firstChoice: z.union([ActionIdSchema, z.literal('STOP')]).nullable(),
  baselineAssessments: z.array(AssessmentSchema),
  metrics: z.object({
    remainingVerificationCapacity: z.number().int().min(0).max(4),
    adaptation: z.enum(['APPROPRIATE', 'INAPPROPRIATE', 'INDETERMINATE']),
    verificationCollected: z.boolean(),
  }),
});
export const CaseComparisonSchema = z
  .object({
    source: z.literal('PRECOMPUTED_OFFLINE'),
    generatedAt: TimestampSchema,
    initialStateHash: z.string().regex(/^[a-f0-9]{64}$/),
    rows: z.array(ComparisonRowSchema),
    actualAstraMeasured: z.boolean(),
  })
  .strict();
export type CaseComparison = z.infer<typeof CaseComparisonSchema>;

const SyntheticAuthorizeCommandSchema = z
  .object({
    scenario: z.literal('SYNTHETIC_ASSUMED_COMPROMISE'),
    assumptions: z.array(AssumptionSchema).length(3),
    change: z.literal('jenkins.cli_enabled:true->false'),
  })
  .strict()
  .refine((c) => new Set(c.assumptions).size === 3);
export const AuthorizeCommandSchema = z.union([
  SyntheticAuthorizeCommandSchema,
  z
    .object({
      scenario: z.literal('OWNED_FIXTURE_INSPECTION'),
      assumptions: z.array(AssumptionSchema).length(0),
      change: z.literal('NONE'),
    })
    .strict(),
]);
export const CreateAttemptCommandSchema = z
  .object({ variant: ScenarioVariantSchema.default('CANONICAL') })
  .strict();
export const InspectCommandSchema = z.object({ fixtureId: z.literal('acme-login') }).strict();
export const ContinueCommandSchema = z
  .object({ requestId: IdSchema, revision: z.number().int().nonnegative() })
  .strict();
