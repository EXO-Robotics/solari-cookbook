import type {
  ActionId,
  InvestigationDefinition,
  Predicate,
  Subject,
} from '../../contracts/index.ts';

// Security policy, independent of presentation catalog objects or model output.
const definitions: InvestigationDefinition[] = [
  {
    id: 'INV-SECRET-METADATA',
    label: 'Inspect additional secret metadata',
    cost: 1,
    target: 'legacy-prod-secrets',
    coverage: ['legacy_reference', 'artifact_metadata'],
    hypotheses: ['HYP-001'],
    sourceCurrent: true,
    sourceComplete: true,
    order: 0,
  },
  {
    id: 'INV-PRINCIPAL-STATUS',
    label: 'Check referenced principal status',
    cost: 1,
    target: 'prod-admin-legacy',
    coverage: ['principal_status'],
    hypotheses: ['HYP-001'],
    sourceCurrent: true,
    sourceComplete: true,
    order: 1,
  },
  {
    id: 'INV-PRODUCTION-MAP',
    label: 'Map Production resources',
    cost: 2,
    target: 'Production',
    coverage: ['production_map'],
    hypotheses: ['HYP-001'],
    sourceCurrent: true,
    sourceComplete: true,
    order: 2,
  },
  {
    id: 'INV-CREDENTIAL-AGE',
    label: 'Inspect credential age',
    cost: 1,
    target: 'legacy-prod-secrets',
    coverage: ['credential_age_days'],
    hypotheses: ['HYP-001'],
    sourceCurrent: true,
    sourceComplete: true,
    order: 3,
  },
  {
    id: 'INV-ACTIVITY-LEDGER',
    label: 'Review identity + workload activity',
    cost: 1,
    target: 'prod-admin-legacy',
    coverage: ['principal_status', 'last_auth_days', 'runtime_identity'],
    hypotheses: ['HYP-001', 'HYP-002'],
    sourceCurrent: true,
    sourceComplete: true,
    order: 4,
  },
  {
    id: 'INV-JENKINS-PLUGINS',
    label: 'Enumerate Jenkins plugins',
    cost: 1,
    target: 'Jenkins-02',
    coverage: ['plugins'],
    hypotheses: ['HYP-002'],
    sourceCurrent: true,
    sourceComplete: true,
    order: 5,
  },
  {
    id: 'INV-JENKINS-CLI',
    label: 'Check Jenkins CLI availability',
    cost: 1,
    target: 'Jenkins-02',
    coverage: ['cli_available'],
    hypotheses: ['HYP-002'],
    sourceCurrent: true,
    sourceComplete: true,
    order: 6,
  },
  {
    id: 'INV-ASSET-INVENTORY',
    label: 'Refresh full asset inventory',
    cost: 2,
    target: 'Apprentice-07',
    coverage: ['direct_access', 'product'],
    hypotheses: ['HYP-001', 'HYP-002'],
    sourceCurrent: true,
    sourceComplete: true,
    order: 7,
  },
  {
    id: 'INV-JENKINS-VERSION',
    label: 'Confirm exact Jenkins version',
    cost: 1,
    target: 'Jenkins-02',
    coverage: ['jenkins_version'],
    hypotheses: ['HYP-002'],
    sourceCurrent: true,
    sourceComplete: true,
    order: 8,
  },
];

export const ACTION_POLICY: readonly Readonly<InvestigationDefinition>[] = Object.freeze(
  definitions.map((d) =>
    Object.freeze({
      ...d,
      coverage: Object.freeze([...d.coverage]) as Predicate[],
      hypotheses: Object.freeze([...d.hypotheses]) as InvestigationDefinition['hypotheses'],
    }),
  ),
);
export const ACTION_CONTRACT_VERSION = 'actions-1' as const;
export function canonicalAction(id: ActionId): InvestigationDefinition {
  return structuredClone(ACTION_POLICY.find((d) => d.id === id)!);
}

const resourceSubjects: Subject[] = [
  'Internal Wiki',
  'Git Metadata',
  'Engineering Share',
  'Jenkins-02',
  'legacy-prod-secrets',
  'Finance Admin',
  'Production',
];
const pairs: Record<ActionId, readonly string[]> = {
  'INV-SECRET-METADATA': [
    'legacy-prod-secrets:legacy_reference',
    'legacy-prod-secrets:artifact_metadata',
  ],
  'INV-PRINCIPAL-STATUS': ['prod-admin-legacy:principal_status'],
  'INV-PRODUCTION-MAP': ['Production:production_map'],
  'INV-CREDENTIAL-AGE': ['legacy-prod-secrets:credential_age_days'],
  'INV-ACTIVITY-LEDGER': [
    'prod-admin-legacy:principal_status',
    'prod-admin-legacy:last_auth_days',
    'Jenkins-02:runtime_identity',
  ],
  'INV-JENKINS-PLUGINS': ['Jenkins-02:plugins'],
  'INV-JENKINS-CLI': ['Jenkins-02:cli_available'],
  'INV-ASSET-INVENTORY': [
    ...resourceSubjects.map((s) => `${s}:direct_access`),
    'Jenkins-02:product',
  ],
  'INV-JENKINS-VERSION': ['Jenkins-02:jenkins_version'],
};
export function permitsObservation(
  actionId: ActionId,
  subject: Subject,
  predicate: Predicate,
): boolean {
  return pairs[actionId].includes(`${subject}:${predicate}`);
}
export function isPlannerFactPair(subject: Subject, predicate: Predicate): boolean {
  return (
    (subject === 'ci-service' && predicate === 'staging_grant') ||
    Object.values(pairs).some((p) => p.includes(`${subject}:${predicate}`))
  );
}
