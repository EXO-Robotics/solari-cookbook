import { randomUUID } from 'node:crypto';
import {
  CaseIdentitySchema,
  ChangeSchema,
  InvestigationDefinitionSchema,
  ObservationSchema,
  ScenarioVariantSchema,
  type Authorization,
  type CaseIdentity,
  type Change,
  type InvestigationDefinition,
  type Observation,
  type Predicate,
  type ScenarioVariant,
  type Subject,
} from '../../contracts/index.ts';
import {
  evidenceTime,
  hasAuthorization,
  usableObservations,
  type EvidenceTime,
} from '../evidence/index.ts';
import { catalogFor, DIRECT_RESOURCES } from './catalog.ts';

export { catalogFor, DIRECT_RESOURCES } from './catalog.ts';
export { JENKINS_ADVISORY, jenkinsApplicability } from './advisory.ts';

type ObservationValue = { [P in Predicate]: Extract<Observation, { predicate: P }>['value'] };
export type SyntheticEnvironment = {
  initialObservations(identity: CaseIdentity, now?: EvidenceTime): Observation[];
  collect(action: InvestigationDefinition, identity: CaseIdentity): Promise<Observation[]>;
  applyChange(
    identity: CaseIdentity,
    authorization: Authorization | null,
    observations: Observation[],
    now?: EvidenceTime,
  ): { identity: CaseIdentity; observations: Observation[]; change: Change };
};

/** Each construction owns an independent synthetic state. No truth object is exported. */
export function createSyntheticEnvironment(
  variant: ScenarioVariant,
  options: { now?: () => EvidenceTime } = {},
): SyntheticEnvironment {
  ScenarioVariantSchema.parse(variant);
  const clock = options.now ?? (() => new Date());
  let boundIdentity: CaseIdentity | null = null;
  let initial: Observation[] | null = null;
  let cliEnabled = true;
  let changeApplied = false;

  function assertIdentity(identity: CaseIdentity): void {
    CaseIdentitySchema.parse(identity);
    if (!boundIdentity) {
      if (identity.revision !== 0)
        throw new Error('A synthetic environment must start at revision zero');
      boundIdentity = structuredClone(identity);
    }
    if (
      identity.runId !== boundIdentity.runId ||
      identity.attemptId !== boundIdentity.attemptId ||
      identity.ledgerId !== boundIdentity.ledgerId ||
      identity.caseId !== boundIdentity.caseId ||
      identity.revision !== boundIdentity.revision
    )
      throw new Error('Synthetic environment identity mismatch');
  }

  function observation<P extends Predicate>(
    identity: CaseIdentity,
    subject: Subject,
    predicate: P,
    value: ObservationValue[P],
    action: InvestigationDefinition | null,
    now: number,
  ): Observation {
    const stale = variant === 'LEDGER_STALE' && action?.id === 'INV-ACTIVITY-LEDGER';
    const observedAt = stale ? now - 24 * 60 * 60 * 1000 : now;
    return ObservationSchema.parse({
      id: `obs_${randomUUID()}`,
      runId: identity.runId,
      caseId: identity.caseId,
      revision: identity.revision,
      subject,
      predicate,
      value,
      domain: 'SYNTHETIC_ORGANIZATION',
      source: {
        kind: action ? 'SYNTHETIC_COLLECTOR' : 'INITIAL_INVENTORY',
        reference: `source_${randomUUID()}`,
        authority: 'AUTHORITATIVE',
        actionId: action?.id ?? null,
      },
      observedAt: new Date(observedAt).toISOString(),
      validity: {
        current: !stale,
        validUntil: new Date(stale ? now - 1000 : now + 60 * 60 * 1000).toISOString(),
        scope: identity.caseId,
        completeness: stale ? 'INCOMPLETE' : 'COMPLETE',
        carriedFrom: null,
      },
    });
  }

  function inventory(
    identity: CaseIdentity,
    action: InvestigationDefinition | null,
    now: number,
  ): Observation[] {
    return [
      ...DIRECT_RESOURCES.map((subject) =>
        observation(
          identity,
          subject,
          'direct_access',
          subject === 'Finance Admin' || subject === 'Production' ? 'BLOCKED' : 'REACHABLE',
          action,
          now,
        ),
      ),
      observation(identity, 'Jenkins-02', 'product', 'Jenkins', action, now),
    ];
  }

  return {
    initialObservations(identity, now = clock()) {
      assertIdentity(identity);
      if (identity.revision !== 0)
        throw new Error('Initial inventory is only available at revision zero');
      if (!initial) {
        const at = evidenceTime(now);
        initial = [
          ...inventory(identity, null, at),
          observation(
            identity,
            'legacy-prod-secrets',
            'legacy_reference',
            'prod-admin-legacy',
            null,
            at,
          ),
          observation(identity, 'ci-service', 'staging_grant', true, null, at),
          ...(variant === 'RUNTIME_KNOWN'
            ? [observation(identity, 'Jenkins-02', 'runtime_identity', 'ci-service', null, at)]
            : []),
        ];
      }
      return structuredClone(initial);
    },

    async collect(requested, identity) {
      assertIdentity(identity);
      const parsed = InvestigationDefinitionSchema.parse(requested);
      const action = catalogFor(variant).find((entry) => entry.id === parsed.id);
      if (!action || JSON.stringify(action) !== JSON.stringify(parsed))
        throw new Error('Collector requires an unchanged canonical action');
      const at = evidenceTime(clock());
      switch (action.id) {
        case 'INV-SECRET-METADATA':
          return [
            observation(
              identity,
              'legacy-prod-secrets',
              'legacy_reference',
              'prod-admin-legacy',
              action,
              at,
            ),
            observation(
              identity,
              'legacy-prod-secrets',
              'artifact_metadata',
              'REFERENCE_ONLY_NO_SECRET',
              action,
              at,
            ),
          ];
        case 'INV-PRINCIPAL-STATUS':
          return [
            observation(identity, 'prod-admin-legacy', 'principal_status', 'DISABLED', action, at),
          ];
        case 'INV-PRODUCTION-MAP':
          return [
            observation(
              identity,
              'Production',
              'production_map',
              'AUTHORITY_NOT_ESTABLISHED',
              action,
              at,
            ),
          ];
        case 'INV-CREDENTIAL-AGE':
          return [
            observation(identity, 'legacy-prod-secrets', 'credential_age_days', 91, action, at),
          ];
        case 'INV-ACTIVITY-LEDGER':
          return [
            observation(identity, 'prod-admin-legacy', 'principal_status', 'DISABLED', action, at),
            observation(identity, 'prod-admin-legacy', 'last_auth_days', 91, action, at),
            observation(identity, 'Jenkins-02', 'runtime_identity', 'ci-service', action, at),
          ];
        case 'INV-JENKINS-PLUGINS':
          return [
            observation(
              identity,
              'Jenkins-02',
              'plugins',
              ['git', 'workflow-aggregator'],
              action,
              at,
            ),
          ];
        case 'INV-JENKINS-CLI':
          return [observation(identity, 'Jenkins-02', 'cli_available', cliEnabled, action, at)];
        case 'INV-ASSET-INVENTORY':
          return inventory(identity, action, at);
        case 'INV-JENKINS-VERSION':
          return [observation(identity, 'Jenkins-02', 'jenkins_version', '2.441', action, at)];
      }
    },

    applyChange(identity, authorization, observations, now = clock()) {
      assertIdentity(identity);
      const at = evidenceTime(now);
      if (!hasAuthorization(authorization, at))
        throw new Error('Explicit synthetic change authorization is required');
      if (changeApplied || !cliEnabled)
        throw new Error('The one-field synthetic change has already been applied');
      const valid = usableObservations(identity, observations, at);
      const changeId = `change_${randomUUID()}`;
      const nextIdentity = { ...identity, revision: identity.revision + 1 };
      const carried = valid
        .filter((item) => item.predicate !== 'cli_available')
        .map((item) =>
          ObservationSchema.parse({
            ...item,
            id: `obs_${randomUUID()}`,
            revision: nextIdentity.revision,
            validity: {
              ...item.validity,
              carriedFrom: { observationId: item.id, revision: item.revision, changeId },
            },
          }),
        );
      const change = ChangeSchema.parse({
        id: changeId,
        authorizedBy: authorization.id,
        at: new Date(at).toISOString(),
        fromRevision: identity.revision,
        toRevision: nextIdentity.revision,
        field: 'jenkins.cli_enabled',
        before: true,
        after: false,
        invalidatedObservationIds: observations
          .filter(
            (item) => item.revision === identity.revision && item.predicate === 'cli_available',
          )
          .map((item) => item.id),
        carriedObservationIds: carried.map((item) => item.id),
      });
      cliEnabled = false;
      changeApplied = true;
      boundIdentity = structuredClone(nextIdentity);
      return {
        identity: nextIdentity,
        observations: [...structuredClone(observations), ...carried],
        change,
      };
    },
  };
}
