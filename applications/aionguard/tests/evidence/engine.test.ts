import { describe, expect, it } from 'vitest';
import {
  ASSUMPTIONS,
  ObservationSchema,
  type ActionId,
  type Authorization,
  type BrokerReceipt,
  type CaseIdentity,
  type Observation,
  type ScenarioVariant,
} from '../../src/contracts/index.ts';
import { deriveAccess, evaluate, usableObservations } from '../../src/server/evidence/index.ts';
import {
  catalogFor,
  createSyntheticEnvironment,
  jenkinsApplicability,
} from '../../src/server/fixtures/index.ts';

const AT = Date.parse('2026-09-10T12:00:00.000Z');
const identity: CaseIdentity = {
  schemaVersion: '1.0.0',
  caseId: 'PR-014',
  runId: 'run_evidence',
  attemptId: 'attempt_evidence',
  ledgerId: 'ledger_evidence',
  revision: 0,
};
const authorization: Authorization = {
  id: 'auth_evidence',
  at: new Date(AT - 1000).toISOString(),
  scenario: 'SYNTHETIC_ASSUMED_COMPROMISE',
  principal: 'Apprentice-07',
  assumptions: [...ASSUMPTIONS],
  change: 'jenkins.cli_enabled:true->false',
};
function fixture(variant: ScenarioVariant = 'CANONICAL') {
  let now = AT;
  const environment = createSyntheticEnvironment(variant, { now: () => now });
  const initial = environment.initialObservations(identity);
  const action = (id: ActionId) => catalogFor(variant).find((entry) => entry.id === id)!;
  return {
    environment,
    initial,
    action,
    collect: (id: ActionId) => environment.collect(action(id), identity),
    advance: (milliseconds: number) => {
      now += milliseconds;
      return now;
    },
  };
}
function changed(item: Observation, patch: Record<string, unknown>): Observation {
  return { ...structuredClone(item), ...patch } as Observation;
}
function hypothesis(observations: Observation[], id: 'HYP-001' | 'HYP-002') {
  return evaluate(identity, observations, authorization, AT).find(
    (item) => item.hypothesisId === id,
  )!;
}
async function full() {
  const f = fixture();
  const observations = [
    ...f.initial,
    ...(await f.collect('INV-ACTIVITY-LEDGER')),
    ...(await f.collect('INV-JENKINS-VERSION')),
    ...(await f.collect('INV-JENKINS-CLI')),
  ];
  return { ...f, observations };
}
function verificationReceipt(
  observation: Observation,
  overrides: Partial<BrokerReceipt> = {},
): BrokerReceipt {
  return {
    requestId: 'verify_evidence',
    revision: 1,
    origin: 'OPERATOR_VERIFICATION',
    actionId: 'INV-JENKINS-CLI',
    target: 'Jenkins-02',
    accepted: true,
    reason: 'COLLECTED',
    cost: 1,
    budgetBefore: 1,
    budgetAfter: 0,
    observationIds: [observation.id],
    at: new Date(AT + 2000).toISOString(),
    ...overrides,
  };
}

describe('bounded synthetic inventory and collectors', () => {
  it('derives five reachable and two blocked and excludes downstream Staging', () => {
    const { initial } = fixture();
    expect(deriveAccess(identity, initial, AT)).toEqual({ reachable: 5, blocked: 2 });
    const injected = changed(initial[0]!, { id: 'staging_direct', subject: 'Staging' });
    expect(deriveAccess(identity, [...initial, injected], AT)).toEqual({
      reachable: 5,
      blocked: 2,
    });
  });

  it('does not expose paid truth in initial facts, catalog or environment properties', () => {
    const { initial, environment } = fixture();
    expect(
      initial.filter((item) =>
        [
          'principal_status',
          'jenkins_version',
          'cli_available',
          'runtime_identity',
          'last_auth_days',
        ].includes(item.predicate),
      ),
    ).toEqual([]);
    expect(Object.keys(environment).sort()).toEqual([
      'applyChange',
      'collect',
      'initialObservations',
    ]);
    const view = JSON.stringify({ initial, catalog: catalogFor('CANONICAL') });
    expect(view).not.toContain('DISABLED');
    expect(view).not.toContain('2.441');
    expect(initial.map((item) => item.value)).not.toContain(91);
    expect(catalogFor('CANONICAL').map((item) => item.cost)).toEqual([1, 1, 2, 1, 1, 1, 1, 2, 1]);
  });

  it('all nine handlers return only their permitted coverage with explicit synthetic provenance', async () => {
    const { environment, initial } = fixture();
    expect(initial.length).toBe(10);
    for (const action of catalogFor('CANONICAL')) {
      const observations = await environment.collect(action, identity);
      expect(observations.length).toBeGreaterThan(0);
      for (const item of observations) {
        expect(ObservationSchema.safeParse(item).success).toBe(true);
        expect(action.coverage).toContain(item.predicate);
        expect(item.source.actionId).toBe(action.id);
        expect(item.domain).toBe('SYNTHETIC_ORGANIZATION');
      }
    }
  });

  it('does not broaden inventory, plugins, principal or age collectors', async () => {
    const f = fixture();
    expect((await f.collect('INV-ASSET-INVENTORY')).map((item) => item.predicate)).toEqual([
      ...Array(7).fill('direct_access'),
      'product',
    ]);
    expect((await f.collect('INV-JENKINS-PLUGINS')).map((item) => item.predicate)).toEqual([
      'plugins',
    ]);
    expect((await f.collect('INV-PRINCIPAL-STATUS')).map((item) => item.predicate)).toEqual([
      'principal_status',
    ]);
    expect((await f.collect('INV-CREDENTIAL-AGE')).map((item) => item.predicate)).toEqual([
      'credential_age_days',
    ]);
  });

  it('rejects modified action costs/targets/coverage and cross-run environment use', async () => {
    const f = fixture();
    await expect(
      f.environment.collect({ ...f.action('INV-JENKINS-CLI'), cost: 2 }, identity),
    ).rejects.toThrow('canonical');
    await expect(
      f.environment.collect({ ...f.action('INV-JENKINS-CLI'), target: 'Production' }, identity),
    ).rejects.toThrow('canonical');
    await expect(
      f.environment.collect(
        { ...f.action('INV-JENKINS-CLI'), coverage: ['principal_status'] },
        identity,
      ),
    ).rejects.toThrow('canonical');
    await expect(
      f.environment.collect(f.action('INV-JENKINS-CLI'), { ...identity, runId: 'different_run' }),
    ).rejects.toThrow('identity mismatch');
  });

  it('returns detached copies and independent environment state', async () => {
    const first = fixture();
    const second = fixture();
    first.initial[0]!.validity.current = false;
    expect(first.environment.initialObservations(identity)[0]!.validity.current).toBe(true);
    const catalog = catalogFor('CANONICAL');
    catalog[0]!.coverage.push('principal_status');
    expect(catalogFor('CANONICAL')[0]!.coverage).toEqual(['legacy_reference', 'artifact_metadata']);
    first.environment.applyChange(identity, authorization, first.initial, AT);
    expect((await second.collect('INV-JENKINS-CLI'))[0]!.value).toBe(true);
  });
});

describe('scope, authority and conflict semantics', () => {
  it('requires all three unique scope assumptions and current authorization', async () => {
    const f = fixture();
    const observations = [...f.initial, ...(await f.collect('INV-PRINCIPAL-STATUS'))];
    expect(evaluate(identity, observations, null, AT)[0]!.outcome).toBe('INCONCLUSIVE');
    const repeated = {
      ...authorization,
      assumptions: [ASSUMPTIONS[0]!, ASSUMPTIONS[0]!, ASSUMPTIONS[0]!],
    };
    expect(evaluate(identity, observations, repeated, AT)[0]!.outcome).toBe('INCONCLUSIVE');
    expect(
      evaluate(
        identity,
        observations,
        { ...authorization, at: new Date(AT + 1).toISOString() },
        AT,
      )[0]!.outcome,
    ).toBe('INCONCLUSIVE');
    expect(hypothesis(observations, 'HYP-001').outcome).toBe('DISMISSED');
  });

  it('never treats activity history, age or active status as authentication and production authority', async () => {
    const f = fixture();
    const ledger = await f.collect('INV-ACTIVITY-LEDGER');
    const historyOnly = ledger.filter((item) => item.predicate === 'last_auth_days');
    expect(
      hypothesis(
        [...f.initial, ...historyOnly, ...(await f.collect('INV-CREDENTIAL-AGE'))],
        'HYP-001',
      ).outcome,
    ).toBe('INCONCLUSIVE');
    const active = ledger.map((item) =>
      item.predicate === 'principal_status' ? changed(item, { value: 'ACTIVE' }) : item,
    );
    expect(
      hypothesis([...f.initial, ...active, ...(await f.collect('INV-PRODUCTION-MAP'))], 'HYP-001')
        .outcome,
    ).toBe('INCONCLUSIVE');
  });

  it.each([
    ['wrong subject', (item: Observation) => changed(item, { subject: 'Apprentice-07' })],
    ['wrong run', (item: Observation) => changed(item, { runId: 'other_run' })],
    ['wrong case', (item: Observation) => changed(item, { caseId: 'PR-999' })],
    ['wrong revision', (item: Observation) => changed(item, { revision: 1 })],
    [
      'stale',
      (item: Observation) => changed(item, { validity: { ...item.validity, current: false } }),
    ],
    [
      'incomplete',
      (item: Observation) =>
        changed(item, { validity: { ...item.validity, completeness: 'INCOMPLETE' } }),
    ],
    [
      'expired',
      (item: Observation) =>
        changed(item, { validity: { ...item.validity, validUntil: new Date(AT).toISOString() } }),
    ],
    [
      'future',
      (item: Observation) => changed(item, { observedAt: new Date(AT + 1).toISOString() }),
    ],
    [
      'wrong scope',
      (item: Observation) => changed(item, { validity: { ...item.validity, scope: 'PR-999' } }),
    ],
    [
      'context only',
      (item: Observation) => changed(item, { source: { ...item.source, authority: 'CONTEXT' } }),
    ],
    [
      'unauthorized collector coverage',
      (item: Observation) =>
        changed(item, { source: { ...item.source, actionId: 'INV-CREDENTIAL-AGE' } }),
    ],
    [
      'paid fact in initial inventory',
      (item: Observation) =>
        changed(item, { source: { ...item.source, kind: 'INITIAL_INVENTORY', actionId: null } }),
    ],
    ['invalid typed value', (item: Observation) => changed(item, { value: 'disabled' })],
  ])('cannot use %s principal evidence to dismiss', async (_name, mutate) => {
    const f = fixture();
    const item = (await f.collect('INV-PRINCIPAL-STATUS'))[0]!;
    const result = hypothesis([...f.initial, mutate(item)], 'HYP-001');
    expect(result.outcome).toBe('INCONCLUSIVE');
    expect(result.falsifyingObservationIds).toEqual([]);
  });

  it('does not resolve opposing authoritative evidence by choosing a newer timestamp', async () => {
    const f = fixture();
    const disabled = (await f.collect('INV-PRINCIPAL-STATUS'))[0]!;
    const active = changed(disabled, {
      id: 'status_conflict',
      value: 'ACTIVE',
      observedAt: new Date(AT - 1000).toISOString(),
    });
    const result = hypothesis([...f.initial, disabled, active], 'HYP-001');
    expect(result.outcome).toBe('INCONCLUSIVE');
    expect(result.gaps.join(' ')).toContain('conflicting');
  });

  it('rejects duplicate observation IDs and counts resources only once', () => {
    const f = fixture();
    const duplicateValue = changed(f.initial[0]!, { id: 'second_reference_same_resource' });
    expect(deriveAccess(identity, [...f.initial, duplicateValue], AT)).toEqual({
      reachable: 5,
      blocked: 2,
    });
    expect(deriveAccess(identity, [...f.initial, f.initial[0]!], AT)).toEqual({
      reachable: 4,
      blocked: 2,
    });
  });

  it('lets an independent undisputed CLI falsifier dismiss despite conflicting versions', async () => {
    const f = await full();
    const version = f.observations.find((item) => item.predicate === 'jenkins_version')!;
    const conflicting = changed(version, { id: 'version_conflict', value: '2.442' });
    const observations = f.observations.map((item) =>
      item.predicate === 'cli_available' ? changed(item, { value: false }) : item,
    );
    const result = hypothesis([...observations, conflicting], 'HYP-002');
    expect(result.outcome).toBe('DISMISSED');
    expect(result.depth).toBe(1);
    expect(result.ruleIds).toContain('JENKINS_CLI_UNAVAILABLE');
  });
});

describe('cumulative Jenkins evidence depth', () => {
  it('cannot jump from known Staging grant to runtime identity or from unknown version to E2+', async () => {
    const f = fixture();
    expect(hypothesis(f.initial, 'HYP-002')).toMatchObject({ outcome: 'INCONCLUSIVE', depth: 1 });
    const downstream = [
      ...f.initial,
      ...(await f.collect('INV-ACTIVITY-LEDGER')),
      ...(await f.collect('INV-JENKINS-CLI')),
    ];
    expect(hypothesis(downstream, 'HYP-002')).toMatchObject({ outcome: 'INCONCLUSIVE', depth: 1 });
    const version = [...f.initial, ...(await f.collect('INV-JENKINS-VERSION'))];
    expect(hypothesis(version, 'HYP-002')).toMatchObject({ outcome: 'INCONCLUSIVE', depth: 2 });
    const cli = [...version, ...(await f.collect('INV-JENKINS-CLI'))];
    expect(hypothesis(cli, 'HYP-002')).toMatchObject({ outcome: 'RETAINED', depth: 3 });
    expect(
      hypothesis([...cli, ...(await f.collect('INV-ACTIVITY-LEDGER'))], 'HYP-002'),
    ).toMatchObject({ outcome: 'RETAINED', depth: 4, consequenceValidated: false });
  });

  it('requires unconflicted reachability, product and prerequisites for retained E3/E4', async () => {
    const f = await full();
    const noProduct = f.observations.filter((item) => item.predicate !== 'product');
    expect(hypothesis(noProduct, 'HYP-002')).toMatchObject({ outcome: 'INCONCLUSIVE', depth: 0 });
    const noAccess = f.observations.filter(
      (item) => !(item.predicate === 'direct_access' && item.subject === 'Jenkins-02'),
    );
    expect(hypothesis(noAccess, 'HYP-002')).toMatchObject({ outcome: 'INCONCLUSIVE', depth: null });
    const cli = f.observations.find((item) => item.predicate === 'cli_available')!;
    expect(
      hypothesis(
        [...f.observations, changed(cli, { id: 'cli_conflict', value: false })],
        'HYP-002',
      ),
    ).toMatchObject({ outcome: 'INCONCLUSIVE', depth: 2 });
    expect(hypothesis(f.observations, 'HYP-001').depth).toBeNull();
  });

  it.each([
    ['2.441', 'AFFECTED'],
    ['2.442', 'NOT_AFFECTED'],
    ['2.426.2', 'AFFECTED'],
    ['2.426.3', 'NOT_AFFECTED'],
    ['2.440.1', 'NOT_AFFECTED'],
    ['2.425.9', 'AFFECTED'],
    ['1.600', 'AFFECTED'],
    ['3.1', 'NOT_AFFECTED'],
    ['2.441-beta', 'UNKNOWN'],
    ['02.441', 'UNKNOWN'],
    ['0.441', 'UNKNOWN'],
  ])('maps %s to %s without conflating weekly and LTS ranges', (version, applicability) => {
    expect(jenkinsApplicability(version)).toBe(applicability);
  });

  it('preserves visible uncertainty in the stale/incomplete ledger variant', async () => {
    const f = fixture('LEDGER_STALE');
    const ledger = await f.collect('INV-ACTIVITY-LEDGER');
    expect(f.action('INV-ACTIVITY-LEDGER')).toMatchObject({
      sourceCurrent: false,
      sourceComplete: false,
    });
    expect(
      ledger.every((item) => !item.validity.current && item.validity.completeness === 'INCOMPLETE'),
    ).toBe(true);
    const observations = [
      ...f.initial,
      ...ledger,
      ...(await f.collect('INV-JENKINS-CLI')),
      ...(await f.collect('INV-JENKINS-VERSION')),
    ];
    expect(hypothesis(observations, 'HYP-001').outcome).toBe('INCONCLUSIVE');
    expect(hypothesis(observations, 'HYP-002')).toMatchObject({ outcome: 'RETAINED', depth: 3 });
    expect(
      hypothesis([...observations, ...(await f.collect('INV-PRINCIPAL-STATUS'))], 'HYP-001')
        .outcome,
    ).toBe('DISMISSED');
  });

  it('runtime-known variant changes only the starting runtime observation', () => {
    const canonical = fixture('CANONICAL').initial;
    const known = fixture('RUNTIME_KNOWN').initial;
    expect(known.length).toBe(canonical.length + 1);
    expect(known.filter((item) => item.predicate === 'runtime_identity')).toHaveLength(1);
    expect(catalogFor('RUNTIME_KNOWN')).toEqual(catalogFor('CANONICAL'));
  });
});

describe('authorized one-field change and paid fresh verification', () => {
  it('preserves baseline bytes, carries unchanged facts explicitly, and never treats the write as evidence', async () => {
    const f = await full();
    const before = JSON.stringify(f.observations);
    const at = f.advance(1000);
    const changedState = f.environment.applyChange(identity, authorization, f.observations, at);
    expect(JSON.stringify(f.observations)).toBe(before);
    expect(identity.revision).toBe(0);
    expect(changedState.identity.revision).toBe(1);
    expect(changedState.change.invalidatedObservationIds).toEqual(
      f.observations.filter((item) => item.predicate === 'cli_available').map((item) => item.id),
    );
    expect(
      changedState.observations
        .filter((item) => item.revision === 1)
        .every((item) => item.predicate !== 'cli_available' && item.validity.carriedFrom !== null),
    ).toBe(true);
    const after = evaluate(changedState.identity, changedState.observations, authorization, at, {
      change: changedState.change,
      receipts: [],
    });
    expect(after[0]!.outcome).toBe('DISMISSED');
    expect(after[1]).toMatchObject({ outcome: 'INCONCLUSIVE', depth: 2 });
    expect(after[1]!.gaps.join(' ')).toContain('OPERATOR_VERIFICATION');
    expect(hypothesis(f.observations, 'HYP-002')).toMatchObject({ outcome: 'RETAINED', depth: 4 });
    expect(
      deriveAccess(changedState.identity, changedState.observations, at, {
        change: changedState.change,
      }),
    ).toEqual({ reachable: 5, blocked: 2 });
  });

  it('requires a successful paid operator receipt for fresh CLI evidence before dismissing', async () => {
    const f = await full();
    f.advance(1000);
    const state = f.environment.applyChange(identity, authorization, f.observations);
    const at = f.advance(1000);
    const fresh = (await f.environment.collect(f.action('INV-JENKINS-CLI'), state.identity))[0]!;
    expect(fresh.value).toBe(false);
    const observations = [...state.observations, fresh];
    expect(
      evaluate(state.identity, observations, authorization, at, { change: state.change })[1]!
        .outcome,
    ).toBe('INCONCLUSIVE');
    for (const overrides of [
      { origin: 'ASTRA' as const },
      { cost: 0 },
      { reason: 'COLLECTION_FAILED' as const },
      { accepted: false },
      { revision: 0 },
      { observationIds: [] },
      { target: 'Production' as const },
      { at: new Date(AT).toISOString() },
      { at: new Date(at + 1).toISOString() },
      { budgetBefore: 1, budgetAfter: 1 },
      { budgetBefore: 5, budgetAfter: 4 },
    ]) {
      expect(
        evaluate(state.identity, observations, authorization, at, {
          change: state.change,
          receipts: [verificationReceipt(fresh, overrides)],
        })[1]!.outcome,
      ).toBe('INCONCLUSIVE');
    }
    const result = evaluate(state.identity, observations, authorization, at, {
      change: state.change,
      receipts: [verificationReceipt(fresh)],
    })[1]!;
    expect(result).toMatchObject({ outcome: 'DISMISSED', depth: 2, consequenceValidated: false });
    expect(result.falsifyingObservationIds).toEqual([fresh.id]);
    expect(
      evaluate(state.identity, observations, authorization, at, {
        change: { ...state.change, authorizedBy: 'different_authorization' },
        receipts: [verificationReceipt(fresh)],
      })[1]!.outcome,
    ).toBe('INCONCLUSIVE');
  });

  it('rejects carry-forward without its exact manifest and original value/source/time provenance', async () => {
    const f = await full();
    const at = f.advance(1000);
    const state = f.environment.applyChange(identity, authorization, f.observations);
    expect(usableObservations(state.identity, state.observations, at)).toEqual([]);
    const carriedStatus = state.observations.find(
      (item) => item.revision === 1 && item.predicate === 'principal_status',
    )!;
    for (const mutate of [
      (item: Observation) => changed(item, { value: 'ACTIVE' }),
      (item: Observation) => changed(item, { observedAt: new Date(at).toISOString() }),
      (item: Observation) =>
        changed(item, { source: { ...item.source, reference: 'forged_source' } }),
      (item: Observation) =>
        changed(item, {
          validity: {
            ...item.validity,
            carriedFrom: { ...item.validity.carriedFrom!, changeId: 'wrong_change' },
          },
        }),
      (item: Observation) =>
        changed(item, {
          validity: {
            ...item.validity,
            carriedFrom: { ...item.validity.carriedFrom!, observationId: 'absent_original' },
          },
        }),
    ]) {
      const altered = state.observations.map((item) =>
        item.id === carriedStatus.id ? mutate(item) : item,
      );
      expect(
        evaluate(state.identity, altered, authorization, at, { change: state.change })[0]!.outcome,
      ).toBe('INCONCLUSIVE');
    }
    const withoutOriginal = state.observations.filter(
      (item) => item.id !== carriedStatus.validity.carriedFrom!.observationId,
    );
    expect(
      evaluate(state.identity, withoutOriginal, authorization, at, { change: state.change })[0]!
        .outcome,
    ).toBe('INCONCLUSIVE');
  });

  it('never refreshes timestamps/expiry when carrying facts into the changed revision', async () => {
    const f = await full();
    f.advance(1000);
    const state = f.environment.applyChange(identity, authorization, f.observations);
    const at = f.advance(60 * 60 * 1000);
    expect(
      usableObservations(state.identity, state.observations, at, { change: state.change }),
    ).toEqual([]);
    expect(
      evaluate(state.identity, state.observations, authorization, at, {
        change: state.change,
      }).every((item) => item.outcome === 'INCONCLUSIVE'),
    ).toBe(true);
  });

  it('rejects missing authorization, wrong environment identity and duplicate changes', async () => {
    const f = await full();
    expect(() => f.environment.applyChange(identity, null, f.observations)).toThrow(
      'authorization',
    );
    expect(() =>
      f.environment.applyChange(
        { ...identity, ledgerId: 'foreign_ledger' },
        authorization,
        f.observations,
      ),
    ).toThrow('identity mismatch');
    const state = f.environment.applyChange(identity, authorization, f.observations);
    expect(() =>
      f.environment.applyChange(state.identity, authorization, state.observations),
    ).toThrow('already been applied');
    await expect(f.environment.collect(f.action('INV-JENKINS-CLI'), identity)).rejects.toThrow(
      'identity mismatch',
    );
  });
});
