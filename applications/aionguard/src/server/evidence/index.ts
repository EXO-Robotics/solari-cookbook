import {
  ASSUMPTIONS,
  AssessmentSchema,
  AuthorizationSchema,
  BrokerReceiptSchema,
  CaseIdentitySchema,
  ChangeSchema,
  ObservationSchema,
  type Assessment,
  type Authorization,
  type BrokerReceipt,
  type CaseIdentity,
  type Change,
  type HypothesisDefinition,
  type Observation,
  type Predicate,
  type Subject,
} from '../../contracts/index.ts';
import { DIRECT_RESOURCES, catalogFor } from '../fixtures/catalog.ts';
import { jenkinsApplicability } from '../fixtures/advisory.ts';

export type EvaluationContext = { change?: Change; receipts?: BrokerReceipt[] };
export type EvidenceTime = Date | number | string;
const permittedCoverage = new Map<string, ReadonlySet<Predicate>>(
  catalogFor('CANONICAL').map((action) => [action.id, new Set(action.coverage)]),
);
export const hypothesisDefinitions: HypothesisDefinition[] = [
  {
    id: 'HYP-001',
    title: 'Legacy Production',
    impact: 'CRITICAL',
    requiredPredicates: ['direct_access', 'legacy_reference', 'principal_status', 'production_map'],
    assumptions: [...ASSUMPTIONS],
    advisory: null,
  },
  {
    id: 'HYP-002',
    title: 'Jenkins service exposure',
    impact: 'HIGH',
    requiredPredicates: [
      'direct_access',
      'product',
      'jenkins_version',
      'cli_available',
      'runtime_identity',
      'staging_grant',
    ],
    assumptions: [],
    advisory: 'CVE-2024-23897',
  },
];

export function evidenceTime(now: EvidenceTime = new Date()): number {
  const value =
    now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(value)) throw new Error('Invalid evidence clock');
  return value;
}

export function hasAuthorization(
  authorization: Authorization | null,
  now: EvidenceTime = new Date(),
): authorization is Authorization {
  const parsed = AuthorizationSchema.safeParse(authorization);
  return (
    parsed.success &&
    new Set(parsed.data.assumptions).size === ASSUMPTIONS.length &&
    ASSUMPTIONS.every((assumption) => parsed.data.assumptions.includes(assumption)) &&
    Date.parse(parsed.data.at) <= evidenceTime(now)
  );
}

function subjectMatches(observation: Observation): boolean {
  switch (observation.predicate) {
    case 'direct_access':
      return DIRECT_RESOURCES.includes(observation.subject);
    case 'legacy_reference':
    case 'artifact_metadata':
    case 'credential_age_days':
      return observation.subject === 'legacy-prod-secrets';
    case 'principal_status':
    case 'last_auth_days':
      return observation.subject === 'prod-admin-legacy';
    case 'product':
    case 'runtime_identity':
    case 'jenkins_version':
    case 'cli_available':
    case 'plugins':
      return observation.subject === 'Jenkins-02';
    case 'staging_grant':
      return observation.subject === 'ci-service';
    case 'production_map':
      return observation.subject === 'Production';
  }
}

function sourceMatches(observation: Observation): boolean {
  if (!subjectMatches(observation)) return false;
  if (observation.source.kind === 'INITIAL_INVENTORY') {
    return (
      observation.source.actionId === null &&
      [
        'direct_access',
        'legacy_reference',
        'product',
        'staging_grant',
        'runtime_identity',
      ].includes(observation.predicate)
    );
  }
  return !!permittedCoverage.get(observation.source.actionId ?? '')?.has(observation.predicate);
}

function baseValid(observation: Observation, identity: CaseIdentity, now: number): boolean {
  const observedAt = Date.parse(observation.observedAt);
  const validUntil = Date.parse(observation.validity.validUntil);
  return (
    observation.runId === identity.runId &&
    observation.caseId === identity.caseId &&
    observation.validity.scope === identity.caseId &&
    observation.validity.current &&
    observation.validity.completeness === 'COMPLETE' &&
    observation.source.authority === 'AUTHORITATIVE' &&
    observedAt <= now &&
    validUntil > now &&
    validUntil > observedAt &&
    sourceMatches(observation)
  );
}

function validChange(change: Change | undefined, identity: CaseIdentity): change is Change {
  const parsed = ChangeSchema.safeParse(change);
  return (
    parsed.success &&
    parsed.data.toRevision === identity.revision &&
    parsed.data.fromRevision + 1 === parsed.data.toRevision
  );
}

function carryMatches(
  observation: Observation,
  all: Observation[],
  identity: CaseIdentity,
  now: number,
  change: Change | undefined,
): boolean {
  const carry = observation.validity.carriedFrom;
  if (
    !carry ||
    !validChange(change, identity) ||
    observation.predicate === 'cli_available' ||
    carry.changeId !== change.id ||
    carry.revision !== change.fromRevision ||
    !change.carriedObservationIds.includes(observation.id) ||
    change.invalidatedObservationIds.includes(carry.observationId)
  )
    return false;
  const originals = all.filter((item) => item.id === carry.observationId);
  if (originals.length !== 1) return false;
  const original = originals[0]!;
  if (
    original.revision !== change.fromRevision ||
    original.validity.carriedFrom ||
    !baseValid(original, identity, now)
  )
    return false;
  // The manifest permits a revision/reference change, never updated values, source or timestamps.
  return (
    JSON.stringify({
      ...observation,
      id: original.id,
      revision: original.revision,
      validity: { ...observation.validity, carriedFrom: null },
    }) === JSON.stringify(original)
  );
}

/** Only validated, current, authoritative facts for this case revision can decide a rule. */
export function usableObservations(
  identity: CaseIdentity,
  observations: Observation[],
  now: EvidenceTime = new Date(),
  context: EvaluationContext = {},
): Observation[] {
  CaseIdentitySchema.parse(identity);
  const at = evidenceTime(now);
  const parsed = observations.flatMap((value) => {
    const item = ObservationSchema.safeParse(value);
    return item.success ? [item.data] : [];
  });
  const ids = new Map<string, number>();
  for (const item of parsed) ids.set(item.id, (ids.get(item.id) ?? 0) + 1);
  return parsed.filter((item) => {
    if (
      ids.get(item.id) !== 1 ||
      item.revision !== identity.revision ||
      !baseValid(item, identity, at)
    )
      return false;
    if (item.validity.carriedFrom && !carryMatches(item, parsed, identity, at, context.change))
      return false;
    if (identity.revision > 0) {
      if (!validChange(context.change, identity) || Date.parse(context.change.at) > at)
        return false;
      if (!item.validity.carriedFrom && Date.parse(item.observedAt) < Date.parse(context.change.at))
        return false;
      if (!item.validity.carriedFrom && item.source.kind !== 'SYNTHETIC_COLLECTOR') return false;
      if (item.predicate === 'cli_available') {
        return (
          !item.validity.carriedFrom &&
          !!context.receipts?.some((value) => {
            const result = BrokerReceiptSchema.safeParse(value);
            if (!result.success) return false;
            const receipt = result.data;
            return (
              receipt.accepted &&
              receipt.reason === 'COLLECTED' &&
              receipt.origin === 'OPERATOR_VERIFICATION' &&
              receipt.actionId === 'INV-JENKINS-CLI' &&
              receipt.target === 'Jenkins-02' &&
              receipt.revision === identity.revision &&
              receipt.cost === 1 &&
              receipt.observationIds.includes(item.id) &&
              receipt.budgetBefore - receipt.budgetAfter === 1 &&
              Date.parse(receipt.at) >= Date.parse(item.observedAt) &&
              Date.parse(receipt.at) <= at
            );
          })
        );
      }
    }
    return true;
  });
}

type Fact =
  | { status: 'KNOWN'; value: Observation['value']; ids: string[] }
  | { status: 'MISSING' | 'CONFLICT'; ids: string[] };
function fact(usable: Observation[], subject: Subject, predicate: Predicate): Fact {
  const matching = usable.filter(
    (item) => item.subject === subject && item.predicate === predicate,
  );
  if (!matching.length) return { status: 'MISSING', ids: [] };
  const values = new Set(matching.map((item) => JSON.stringify(item.value)));
  return values.size > 1
    ? { status: 'CONFLICT', ids: matching.map((item) => item.id) }
    : { status: 'KNOWN', value: matching[0]!.value, ids: matching.map((item) => item.id) };
}
function is(f: Fact, value: Observation['value']): boolean {
  return f.status === 'KNOWN' && f.value === value;
}
function gap(f: Fact, label: string): string | null {
  return f.status === 'KNOWN'
    ? null
    : `${label}: ${f.status === 'CONFLICT' ? 'conflicting authoritative observations' : 'no current, complete, authoritative observation'}.`;
}
function nonNull(values: Array<string | null>): string[] {
  return values.filter((value): value is string => value !== null);
}

export function deriveAccess(
  identity: CaseIdentity,
  observations: Observation[],
  now: EvidenceTime = new Date(),
  context: EvaluationContext = {},
): { reachable: number; blocked: number } {
  const usable = usableObservations(identity, observations, now, context);
  return DIRECT_RESOURCES.reduce(
    (counts, subject) => {
      const access = fact(usable, subject, 'direct_access');
      if (is(access, 'REACHABLE')) counts.reachable += 1;
      if (is(access, 'BLOCKED')) counts.blocked += 1;
      return counts;
    },
    { reachable: 0, blocked: 0 },
  );
}

export function evaluate(
  identity: CaseIdentity,
  observations: Observation[],
  authorization: Authorization | null,
  now: EvidenceTime = new Date(),
  context: EvaluationContext = {},
): Assessment[] {
  const usable = usableObservations(identity, observations, now, context);
  const authorized =
    hasAuthorization(authorization, now) &&
    (identity.revision === 0 ||
      (!!context.change &&
        context.change.authorizedBy === authorization.id &&
        Date.parse(context.change.at) >= Date.parse(authorization.at)));
  const principal = fact(usable, 'prod-admin-legacy', 'principal_status');
  const legacyAccess = fact(usable, 'legacy-prod-secrets', 'direct_access');
  const reference = fact(usable, 'legacy-prod-secrets', 'legacy_reference');
  const h1: Assessment = {
    hypothesisId: 'HYP-001',
    impact: 'CRITICAL',
    outcome: 'INCONCLUSIVE',
    depth: null,
    ruleIds: ['LEGACY_SCOPE', 'LEGACY_AUTHORITY_GAP'],
    supportingObservationIds: [],
    falsifyingObservationIds: [],
    gaps: [],
    consequenceValidated: false,
  };
  if (!authorized)
    h1.gaps.push('Recorded authorization with all three authentication assumptions is required.');
  if (authorized && is(principal, 'DISABLED')) {
    h1.outcome = 'DISMISSED';
    h1.ruleIds = ['LEGACY_DISABLED_CURRENT', 'LEGACY_SCOPE'];
    h1.falsifyingObservationIds = principal.ids;
  } else {
    h1.supportingObservationIds = [legacyAccess, reference, principal]
      .filter((f) => f.status === 'KNOWN')
      .flatMap((f) => f.ids);
    h1.gaps.push(
      ...nonNull([
        gap(legacyAccess, 'Legacy artifact access'),
        gap(reference, 'Legacy reference'),
        gap(principal, 'Referenced principal status'),
      ]),
    );
    h1.gaps.push(
      'Authentication feasibility and Production authority are not established by reference, age, activity history or active status alone.',
    );
  }

  const access = fact(usable, 'Jenkins-02', 'direct_access');
  const product = fact(usable, 'Jenkins-02', 'product');
  const version = fact(usable, 'Jenkins-02', 'jenkins_version');
  const cli = fact(usable, 'Jenkins-02', 'cli_available');
  const runtime = fact(usable, 'Jenkins-02', 'runtime_identity');
  const staging = fact(usable, 'ci-service', 'staging_grant');
  const applicability =
    version.status === 'KNOWN' && typeof version.value === 'string'
      ? jenkinsApplicability(version.value)
      : 'UNKNOWN';
  const h2: Assessment = {
    hypothesisId: 'HYP-002',
    impact: 'HIGH',
    outcome: 'INCONCLUSIVE',
    depth: null,
    ruleIds: ['JENKINS_CONSEQUENCE_GAP'],
    supportingObservationIds: [],
    falsifyingObservationIds: [],
    gaps: [
      'Consequence gap: service takeover and downstream Staging compromise have not been validated.',
    ],
    consequenceValidated: false,
  };
  if (is(access, 'REACHABLE')) {
    h2.depth = 0;
    h2.ruleIds.push('JENKINS_E0');
    h2.supportingObservationIds.push(...access.ids);
    if (is(product, 'Jenkins')) {
      h2.depth = 1;
      h2.ruleIds.push('JENKINS_E1');
      h2.supportingObservationIds.push(...product.ids);
      if (applicability === 'AFFECTED') {
        h2.depth = 2;
        h2.ruleIds.push('JENKINS_E2');
        h2.supportingObservationIds.push(...version.ids);
        if (is(cli, true)) {
          h2.depth = 3;
          h2.ruleIds.push('JENKINS_E3');
          h2.supportingObservationIds.push(...cli.ids);
          if (is(runtime, 'ci-service') && is(staging, true)) {
            h2.depth = 4;
            h2.ruleIds.push('JENKINS_E4');
            h2.supportingObservationIds.push(...runtime.ids, ...staging.ids);
          }
        }
      }
    }
  }
  if (!authorized) h2.gaps.push('Recorded synthetic investigation authorization is required.');
  else if (is(access, 'BLOCKED') || is(cli, false) || applicability === 'NOT_AFFECTED') {
    h2.outcome = 'DISMISSED';
    if (is(access, 'BLOCKED')) {
      h2.ruleIds.push('JENKINS_ACCESS_BLOCKED');
      h2.falsifyingObservationIds.push(...access.ids);
    }
    if (is(cli, false)) {
      h2.ruleIds.push('JENKINS_CLI_UNAVAILABLE');
      h2.falsifyingObservationIds.push(...cli.ids);
    }
    if (applicability === 'NOT_AFFECTED') {
      h2.ruleIds.push('JENKINS_VERSION_NOT_AFFECTED');
      h2.falsifyingObservationIds.push(...version.ids);
    }
  } else if (h2.depth !== null && h2.depth >= 3) h2.outcome = 'RETAINED';
  if (h2.outcome !== 'DISMISSED') {
    h2.gaps.push(
      ...nonNull([
        gap(access, 'Jenkins reachability'),
        gap(product, 'Jenkins product identity'),
        gap(version, 'Exact Jenkins version'),
        gap(cli, 'Effective Jenkins CLI availability'),
        gap(runtime, 'Jenkins runtime identity'),
        gap(staging, 'Runtime principal Staging permission'),
      ]),
    );
    if (version.status === 'KNOWN' && applicability === 'UNKNOWN')
      h2.gaps.push(
        'The observed version cannot be mapped to the pinned weekly or LTS advisory range.',
      );
    if (identity.revision > 0 && cli.status === 'MISSING')
      h2.gaps.push(
        'Fresh paid OPERATOR_VERIFICATION evidence is required for effective CLI availability after the change.',
      );
  }
  return [h1, h2].map((assessment) => AssessmentSchema.parse(assessment));
}
