import { describe, it, expect, vi } from 'vitest';
import {
  ASSUMPTIONS,
  InspectionObservationSchema,
  type Inspector,
  type Planner,
} from '../../src/contracts/index.js';
import { CaseController, assessLink } from '../../src/server/runtime/controller.js';
import { createMockInspector } from '../../src/server/isolation/index.js';
import {
  MockPlanner,
  buildPlannerView,
  serializePlannerRequest,
} from '../../src/server/planner/index.js';

const authorization = {
  scenario: 'SYNTHETIC_ASSUMED_COMPROMISE',
  assumptions: ASSUMPTIONS,
  change: 'jenkins.cli_enabled:true->false',
};
function setup(inspector: Inspector = createMockInspector(), planner: Planner = new MockPlanner()) {
  const controller = new CaseController({
    inspector,
    planner,
    inspectionMode: 'MOCK',
    plannerMode: 'MOCK',
    approvedIdpOrigins: ['https://idp.acme.invalid'],
  });
  const run = controller.create().identity.runId;
  controller.authorize(run, authorization);
  return { controller, run };
}
describe('integrated case lifecycle with injected software providers', () => {
  it('rejects malformed successful provider metadata and image envelopes at the controller gate', async () => {
    const result = await createMockInspector().inspect('acme-login');
    const malformed = {
      ...result,
      sandboxId: null,
      createdAt: null,
      collectionStartedAt: null,
      pngBase64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64'),
    };
    const choose = vi.fn();
    const { controller, run } = setup({ inspect: async () => malformed }, { choose });
    const snapshot = await controller.inspect(run, 'acme-login', 'malformed');
    expect(snapshot.link.classification).toBe('INSPECTION_UNAVAILABLE');
    expect(snapshot.link.failure).toBe('INVALID_EVIDENCE');
    expect(snapshot.link.imagePath).toBe(null);
    expect(choose).not.toHaveBeenCalled();
  });
  it('accepts a genuinely prewarmed timestamp while keeping no-findings blocked', async () => {
    const result = await createMockInspector('SOLARI_SANDBOX').inspect('acme-login');
    const now = Date.now();
    result.createdAt = new Date(now - 60000).toISOString();
    result.cleanup = {
      state: 'RETAINED',
      sandboxId: result.sandboxId,
      stoppedAt: null,
      deletedAt: null,
    };
    result.session = {
      mode: 'WARM',
      readyAt: new Date(now - 30000).toISOString(),
      acquiredAt: new Date(now).toISOString(),
      reused: true,
      inspectionCount: 2,
      disposition: 'RETAINED',
    };
    result.observation = {
      ...result.observation!,
      claimedService: 'UNKNOWN',
      passwordField: false,
      formAction: null,
      formDestinationOrigin: null,
    };
    const assessed = assessLink(result, new Date(now).toISOString(), 'warm', [], true);
    expect(assessed.classification).toBe('UNDETERMINED');
    expect(assessed.decision).toBe('BLOCK');
    expect(assessed.cleanup.state).toBe('RETAINED');
    delete result.session;
    expect(assessLink(result, new Date(now).toISOString(), 'warm', [], true).classification).toBe(
      'INSPECTION_UNAVAILABLE',
    );
  });
  it('rejects a retained sandbox if the controller independently finds a threat', async () => {
    const result = await createMockInspector('SOLARI_SANDBOX').inspect('acme-login');
    result.cleanup = {
      state: 'RETAINED',
      sandboxId: result.sandboxId,
      stoppedAt: null,
      deletedAt: null,
    };
    result.session = {
      mode: 'WARM',
      readyAt: result.createdAt!,
      acquiredAt: result.collectionStartedAt!,
      reused: false,
      inspectionCount: 1,
      disposition: 'RETAINED',
    };
    expect(assessLink(result, result.createdAt!, 'warm', [], true).classification).toBe(
      'INSPECTION_UNAVAILABLE',
    );
  });
  it('blocks before planner, spends canonical credits and keeps the write unverified until paid evidence', async () => {
    const planner = { choose: vi.fn((view) => new MockPlanner().choose(view)) } as Planner;
    const { controller, run } = setup(createMockInspector(), planner);
    const initial = await controller.inspect(run, 'acme-login', 'inspect_1');
    expect(initial.access).toEqual({ reachable: 5, blocked: 2 });
    expect(initial.budget).toEqual({ total: 4, spent: 3, remaining: 1 });
    expect(initial.assessments.map((h) => [h.outcome, h.depth])).toEqual([
      ['DISMISSED', null],
      ['RETAINED', 4],
    ]);
    const block = initial.events.find((e) => e.type === 'LINK_BLOCKED')!;
    const dispatch = initial.events.find((e) => e.type === 'PLANNER_DISPATCHED')!;
    expect(block.sequence).toBeLessThan(dispatch.sequence);
    const pending = await controller.harden(run, 'change_1', 0);
    expect(pending.baseline?.assessments).toEqual(initial.assessments);
    expect(pending.assessments[1]?.outcome).toBe('INCONCLUSIVE');
    expect(pending.verification).toBe('REQUIRED');
    expect(pending.summary.verifiedAfterState).toBe(false);
    expect(pending.events.some((e) => e.type === 'VERIFICATION_COMPLETED')).toBe(false);
    const done = await controller.verify(run, 'verify_1', 1);
    expect(done.verification).toBe('VERIFIED');
    expect(done.budget.remaining).toBe(0);
    expect(done.summary.verifiedAfterState).toBe(true);
    expect(done.baseline).toEqual(pending.baseline);
    expect(done.assessments[1]?.falsifyingObservationIds).toEqual(
      done.brokerReceipts.at(-1)?.observationIds,
    );
    const receipt = controller.receipt(run);
    expect(receipt.claims.endpointInterceptionVerified).toBe(false);
    expect(receipt.snapshot.modes.planner).toBe('MOCK');
    expect(receipt.claims.consequenceDemonstrated).toBe(false);
  });
  it('preserves deterministic block when the model is unavailable', async () => {
    const { controller, run } = setup(createMockInspector(), {
      choose: async () => {
        throw new Error('provider-token-should-not-leak');
      },
    });
    const state = await controller.inspect(run, 'acme-login', 'request');
    expect(state.link.classification).toBe('SUSPICIOUS');
    expect(state.link.decision).toBe('BLOCK');
    expect(state.execution).toBe('MODEL_UNAVAILABLE');
    expect(state.budget.spent).toBe(0);
    expect(JSON.stringify(controller.receipt(run))).not.toContain('provider-token-should-not-leak');
  });
  it('unavailable inspection blocks without invented findings or any model handoff', async () => {
    const choose = vi.fn();
    const { controller, run } = setup(
      {
        inspect: async () => {
          throw new Error('outage');
        },
      },
      { choose },
    );
    const state = await controller.inspect(run, 'acme-login', 'request');
    expect(state.link.classification).toBe('INSPECTION_UNAVAILABLE');
    expect(state.link.ruleIds).toEqual([]);
    expect(state.observations).toEqual([]);
    expect(state.execution).toBe('BLOCKED');
    expect(choose).not.toHaveBeenCalled();
  });
  it('uses fresh independent attempts without refilling an existing ledger', async () => {
    const { controller, run } = setup();
    const spent = await controller.inspect(run, 'acme-login', 'request');
    const fresh = controller.create();
    expect(fresh.budget.remaining).toBe(4);
    expect(fresh.identity.runId).not.toBe(run);
    expect(fresh.identity.ledgerId).not.toBe(spent.identity.ledgerId);
    expect(controller.snapshot(run).budget.remaining).toBe(1);
    expect(fresh.observations).toEqual([]);
  });
  it('rejects a write while a planner is in flight and deduplicates identical inspection requests', async () => {
    let finish!: (decision: { type: 'STOP'; rationale: string }) => void;
    const choose = vi.fn(
      () =>
        new Promise<{ type: 'STOP'; rationale: string }>((resolve) => {
          finish = resolve;
        }),
    );
    const { controller, run } = setup(createMockInspector(), { choose });
    const first = controller.inspect(run, 'acme-login', 'same');
    const retry = controller.inspect(run, 'acme-login', 'same');
    await vi.waitFor(() => expect(choose).toHaveBeenCalledOnce());
    await expect(controller.harden(run, 'change', 0)).rejects.toThrow('ATTEMPT_BUSY');
    await expect(controller.inspect(run, 'different', 'same')).rejects.toThrow(
      'IDEMPOTENCY_CONFLICT',
    );
    finish({ type: 'STOP', rationale: 'No decision.' });
    expect(await first).toEqual(await retry);
  });
  it('retains a verification gap when the model uses the last credit', async () => {
    const order = [
      'INV-PRINCIPAL-STATUS',
      'INV-ACTIVITY-LEDGER',
      'INV-JENKINS-VERSION',
      'INV-JENKINS-CLI',
    ] as const;
    let step = 0;
    const planner: Planner = {
      async choose(view) {
        const next = order[step++];
        const action = view.catalog.find((a) => a.id === next)!;
        return {
          type: 'INVESTIGATE',
          actionId: action.id,
          target: action.target,
          hypothesisIds: action.hypotheses,
          rationale: 'Bounded test alternate route.',
        };
      },
    };
    const { controller, run } = setup(createMockInspector(), planner);
    const before = await controller.inspect(run, 'acme-login', 'request');
    expect(before.budget.remaining).toBe(0);
    expect(before.assessments[1]?.outcome).toBe('RETAINED');
    await controller.harden(run, 'change', 0);
    const after = await controller.verify(run, 'verify', 1);
    expect(after.verification).toBe('GAP');
    expect(after.summary.inconclusive).toBe(1);
    expect(after.summary.verifiedAfterState).toBe(false);
    expect(after.brokerReceipts.at(-1)?.reason).toBe('INSUFFICIENT_BUDGET');
    expect(after.baseline?.assessments[1]?.outcome).toBe('RETAINED');
  });
  it('accepts only recorded explicit authorization before inspection', async () => {
    const inspector = { inspect: vi.fn() };
    const controller = new CaseController({
      inspector,
      planner: new MockPlanner(),
      inspectionMode: 'MOCK',
      plannerMode: 'MOCK',
      approvedIdpOrigins: [],
    });
    const run = controller.create().identity.runId;
    await expect(controller.inspect(run, 'acme-login', 'noauth')).rejects.toThrow(
      'OPERATOR_AUTHORIZATION_REQUIRED',
    );
    expect(() =>
      controller.authorize(run, {
        ...authorization,
        assumptions: [ASSUMPTIONS[0], ASSUMPTIONS[0], ASSUMPTIONS[0]],
      }),
    ).toThrow();
    expect(inspector.inspect).not.toHaveBeenCalled();
  });
  it('snapshot callers cannot mutate stored baseline, facts or credits', async () => {
    const { controller, run } = setup();
    const copy = await controller.inspect(run, 'acme-login', 'request');
    copy.budget.remaining = 4;
    copy.observations.splice(0);
    expect(controller.snapshot(run).budget.remaining).toBe(1);
    expect(controller.snapshot(run).observations.length).toBeGreaterThan(0);
  });
  it('page markers never cross the actual serialized planner boundary', async () => {
    const marker = 'UNTRUSTED_PAGE_MARKER_71';
    const base = await createMockInspector().inspect('acme-login');
    base.observation = {
      ...base.observation!,
      title: marker,
      text: marker,
      finalUrl: `https://fixture.invalid/${marker}`,
      formAction: `https://outside.invalid/${marker}`,
      formDestinationOrigin: 'https://outside.invalid',
    };
    const requests: string[] = [];
    const { controller, run } = setup(
      { inspect: async () => base },
      {
        choose: async (view) => {
          requests.push(serializePlannerRequest(view));
          return new MockPlanner().choose(view);
        },
      },
    );
    await controller.inspect(run, 'acme-login', 'request');
    expect(requests.length).toBeGreaterThan(0);
    for (const serialized of requests) {
      expect(serialized).not.toContain(marker);
      expect(serialized).not.toContain(Buffer.from(marker).toString('base64'));
      expect(serialized).not.toContain('fixture.invalid');
      expect(serialized).not.toContain('outside.invalid');
    }
  });
  it('compares declared authentication destinations by exact normalized origin', async () => {
    const result = await createMockInspector().inspect('acme-login');
    result.observation = {
      ...result.observation!,
      formAction: 'https://trusted.invalid.attacker.invalid/form',
      formDestinationOrigin: 'https://trusted.invalid.attacker.invalid',
    };
    expect(
      assessLink(result, new Date().toISOString(), 'run_test', ['https://trusted.invalid'])
        .classification,
    ).toBe('SUSPICIOUS');
    result.observation.formAction = 'https://trusted.invalid/form';
    result.observation.formDestinationOrigin = 'https://trusted.invalid';
    const assessed = assessLink(result, new Date().toISOString(), 'run_test', [
      'https://trusted.invalid',
    ]);
    expect(assessed.classification).toBe('UNDETERMINED');
    expect(assessed.decision).toBe('BLOCK');
  });
  it.each(['ACME', 'AIONPHISH'] as const)(
    'supports observed %s branding with an exact declared destination mismatch',
    async (claimedService) => {
      const result = await createMockInspector().inspect('acme-login');
      result.observation = InspectionObservationSchema.parse({
        ...result.observation!,
        claimedService,
        formAction: 'https://acme-auth-collector.invalid/session?marker=AG_PAGE_ACTION_7C92',
        formDestinationOrigin: 'https://acme-auth-collector.invalid',
      });
      const assessed = assessLink(result, new Date().toISOString(), 'run_brand', [
        'https://idp.acme.invalid',
      ]);
      expect(assessed.classification).toBe('SUSPICIOUS');
      expect(assessed.ruleIds).toEqual(['AUTH-01', 'AUTH-02']);
      expect(assessed.observation?.claimedService).toBe(claimedService);
      const approved = assessLink(result, new Date().toISOString(), 'run_brand', [
        'https://acme-auth-collector.invalid',
      ]);
      expect(approved.classification).toBe('UNDETERMINED');
      expect(approved.ruleIds).toEqual(['AUTH-01']);
    },
  );
  it.each([
    {
      claimedService: 'UNKNOWN',
      formAction: 'https://outside.invalid/session',
      formDestinationOrigin: 'https://outside.invalid',
    },
    {
      claimedService: 'AIONPHISH',
      formAction: 'https://[',
      formDestinationOrigin: 'https://outside.invalid',
    },
    {
      claimedService: 'AIONPHISH',
      formAction: 'https://outside.invalid/session',
      formDestinationOrigin: 'https://different.invalid',
    },
    {
      claimedService: 'AIONPHISH',
      formAction: null,
      formDestinationOrigin: 'https://outside.invalid',
    },
    {
      claimedService: 'AIONPHISH',
      formAction: 'data:text/plain,inert',
      formDestinationOrigin: null,
    },
  ] as const)(
    'does not manufacture AUTH-02 from an unknown brand or invalid destination: %j',
    async (observation) => {
      const result = await createMockInspector().inspect('acme-login');
      result.observation = InspectionObservationSchema.parse({
        ...result.observation!,
        ...observation,
      });
      const assessed = assessLink(result, new Date().toISOString(), 'run_brand', [
        'https://idp.acme.invalid',
      ]);
      expect(assessed.classification).toBe('UNDETERMINED');
      expect(assessed.ruleIds).toEqual(['AUTH-01']);
      expect(assessed.decision).toBe('BLOCK');
    },
  );
});
