import { describe, expect, it, vi } from 'vitest';
import { createBroker } from '../../src/server/broker/index.ts';
import { observation, request, session } from './helpers.ts';
import type { Observation } from '../../src/contracts/index.ts';

describe('scoped atomic investigation broker', () => {
  it('reserves once before await and shares concurrent exact retry results', async () => {
    const state = session();
    let complete!: (v: Observation[]) => void;
    const collector = vi.fn(
      () =>
        new Promise<Observation[]>((resolve) => {
          complete = resolve;
        }),
    );
    const broker = createBroker(state, collector);
    const first = broker.execute(request());
    const second = broker.execute(request());
    expect(state.budget).toEqual({ total: 4, spent: 1, remaining: 3 });
    expect(collector).toHaveBeenCalledTimes(1);
    complete([observation()]);
    expect(await first).toEqual(await second);
    expect(state.observations).toHaveLength(1);
    expect(state.receipts).toHaveLength(1);
    const replay = await broker.execute(request());
    replay.observationIds.push('tamper');
    expect(state.receipts[0]!.observationIds).toEqual(['obs']);
  });
  it('rejects payload or revision conflicts against an in-flight key without another charge', async () => {
    const state = session();
    let complete!: (v: Observation[]) => void;
    const collector = vi.fn(
      () =>
        new Promise<Observation[]>((resolve) => {
          complete = resolve;
        }),
    );
    const broker = createBroker(state, collector);
    const first = broker.execute(request());
    expect((await broker.execute({ ...request(), rationale: 'different' })).reason).toBe(
      'IDEMPOTENCY_CONFLICT',
    );
    expect((await broker.execute({ ...request(), revision: 1 })).reason).toBe(
      'IDEMPOTENCY_CONFLICT',
    );
    expect(collector).toHaveBeenCalledTimes(1);
    expect(state.budget.spent).toBe(1);
    complete([observation()]);
    await first;
  });
  it('never overspends under concurrent independent requests', async () => {
    const state = session();
    let sequence = 0;
    const broker = createBroker(state, async () => [observation(`obs_${++sequence}`)]);
    const receipts = await Promise.all(
      Array.from({ length: 7 }, (_, i) => broker.execute(request(`request_${i}`))),
    );
    expect(receipts.filter((r) => r.reason === 'COLLECTED')).toHaveLength(4);
    expect(receipts.filter((r) => r.reason === 'INSUFFICIENT_BUDGET')).toHaveLength(3);
    expect(state.budget).toEqual({ total: 4, spent: 4, remaining: 0 });
  });
  it('charges a dispatched failure and caches the same failed receipt', async () => {
    const state = session();
    const collector = vi.fn(async () => {
      throw new Error('secret-provider-message');
    });
    const broker = createBroker(state, collector);
    const receipt = await broker.execute(request());
    expect(receipt.reason).toBe('COLLECTION_FAILED');
    expect(receipt.cost).toBe(1);
    expect(await broker.execute(request())).toEqual(receipt);
    expect(collector).toHaveBeenCalledTimes(1);
    expect(state.observations).toHaveLength(0);
    expect(JSON.stringify(receipt)).not.toContain('secret-provider-message');
  });
  it('rejects an entire broad collection if one observation smuggles a paid predicate', async () => {
    const state = session();
    const good = observation();
    const bad = {
      ...observation('smuggled'),
      subject: 'Jenkins-02',
      predicate: 'jenkins_version',
      value: '2.441',
    } as Observation;
    const receipt = await createBroker(state, async () => [good, bad]).execute(request());
    expect(receipt.reason).toBe('COLLECTION_FAILED');
    expect(state.observations).toEqual([]);
    expect(state.budget.spent).toBe(1);
  });
  it.each(['run', 'revision', 'source', 'carry', 'duplicate', 'subject'] as const)(
    'fails closed for invalid %s provenance',
    async (kind) => {
      const state = session();
      const obs = observation();
      if (kind === 'run') obs.runId = 'different';
      if (kind === 'revision') obs.revision = 1;
      if (kind === 'source') obs.source.actionId = 'INV-ACTIVITY-LEDGER';
      if (kind === 'carry')
        obs.validity.carriedFrom = { observationId: 'fabricated', revision: 0, changeId: 'forged' };
      if (kind === 'duplicate') state.observations.push(observation());
      if (kind === 'subject') obs.subject = 'ci-service';
      expect((await createBroker(state, async () => [obs]).execute(request())).reason).toBe(
        'COLLECTION_FAILED',
      );
    },
  );
  it('does not accept evidence if revision changes during dispatch', async () => {
    const state = session();
    const broker = createBroker(state, async () => {
      state.identity.revision++;
      return [observation()];
    });
    expect((await broker.execute(request())).reason).toBe('COLLECTION_FAILED');
    expect(state.observations).toEqual([]);
    expect(state.budget.spent).toBe(1);
  });
  it.each([
    'unauthorized',
    'duplicate-assumption',
    'wrong-target',
    'forged-cost',
    'forged-coverage',
    'stale',
    'extra-field',
    'operator-read',
  ] as const)('rejects %s before charging', async (kind) => {
    const state = session();
    const req: Record<string, unknown> = request();
    const collector = vi.fn(async () => [observation()]);
    if (kind === 'unauthorized') state.authorization = null;
    if (kind === 'duplicate-assumption')
      state.authorization!.assumptions = [
        'FRESH_AUTH_REQUIRED',
        'FRESH_AUTH_REQUIRED',
        'FRESH_AUTH_REQUIRED',
      ];
    if (kind === 'wrong-target') req.target = 'Production';
    if (kind === 'forged-cost') state.catalog.find((a) => a.id === req.actionId)!.cost = 2;
    if (kind === 'forged-coverage')
      state.catalog.find((a) => a.id === req.actionId)!.coverage.push('runtime_identity');
    if (kind === 'stale') req.revision = 1;
    if (kind === 'extra-field') req.command = 'execute shell';
    if (kind === 'operator-read') req.origin = 'OPERATOR_VERIFICATION';
    expect((await createBroker(state, collector).execute(req)).accepted).toBe(false);
    expect(collector).not.toHaveBeenCalled();
    expect(state.budget.spent).toBe(0);
  });
  it('charges one fresh post-change CLI observation through operator origin', async () => {
    const state = session();
    state.identity.revision = 1;
    const obs = {
      ...observation('after'),
      revision: 1,
      subject: 'Jenkins-02',
      predicate: 'cli_available',
      value: false,
      source: { ...observation().source, actionId: 'INV-JENKINS-CLI' },
    } as Observation;
    const broker = createBroker(state, async () => [obs]);
    expect(
      (
        await broker.execute({
          ...request('fresh', 'INV-JENKINS-CLI'),
          revision: 1,
          origin: 'OPERATOR_VERIFICATION',
        })
      ).reason,
    ).toBe('COLLECTED');
    expect(state.budget.spent).toBe(1);
    expect(
      (await broker.execute({ ...request('model_after', 'INV-JENKINS-CLI'), revision: 1 })).reason,
    ).toBe('INELIGIBLE');
  });
});
