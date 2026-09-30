import {
  InvestigationDefinitionSchema,
  type InvestigationDefinition,
  type ScenarioVariant,
  type Subject,
} from '../../contracts/index.ts';

export const DIRECT_RESOURCES: ReadonlyArray<Subject> = [
  'Internal Wiki',
  'Git Metadata',
  'Engineering Share',
  'Jenkins-02',
  'legacy-prod-secrets',
  'Finance Admin',
  'Production',
];

const catalog: InvestigationDefinition[] = [
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
].map((entry) => InvestigationDefinitionSchema.parse(entry));

/** Returns only possible coverage and source validity, never the private result values. */
export function catalogFor(variant: ScenarioVariant): InvestigationDefinition[] {
  return catalog.map((entry) =>
    structuredClone(
      variant === 'LEDGER_STALE' && entry.id === 'INV-ACTIVITY-LEDGER'
        ? { ...entry, sourceCurrent: false, sourceComplete: false }
        : entry,
    ),
  );
}
