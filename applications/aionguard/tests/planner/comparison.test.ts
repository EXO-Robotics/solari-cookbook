import { describe, expect, it, vi } from 'vitest';
import {
  runComparison,
  type ComparisonEnvironment,
  type ComparisonOptions,
} from '../../src/server/planner/comparison.ts';
import { observation, session } from '../broker/helpers.ts';
import type { Observation, Planner } from '../../src/contracts/index.ts';

const stop: Planner = { choose: async () => ({ type: 'STOP', rationale: 'Offline test stop.' }) };
function environment(runId: string): ComparisonEnvironment {
  const state = session();
  state.identity.runId = runId;
  state.identity.ledgerId = `${runId}_ledger`;
  return {
    session: state,
    evaluate: () => [],
    applyChange: () => {
      state.identity.revision++;
    },
    collector: async (action, identity) => [
      {
        ...observation(`${identity.runId}_cli`),
        runId: identity.runId,
        revision: identity.revision,
        subject: 'Jenkins-02',
        predicate: 'cli_available',
        value: false,
        source: { ...observation().source, actionId: action.id },
      } as Observation,
    ],
  };
}
function options(): ComparisonOptions {
  return {
    variants: ['CANONICAL'],
    planners: [
      { id: 'GREEDY', version: 'test-1', model: null, mode: 'MOCK', planner: stop },
      { id: 'COVERAGE', version: 'test-1', model: null, mode: 'MOCK', planner: stop },
    ],
    factory: (_variant, _planner, runId) => environment(runId),
  };
}

describe('independent offline comparison accounting', () => {
  it('hashes semantically identical starting states and retains separate paid ledgers', async () => {
    const report = await runComparison(options());
    expect(report.runs).toHaveLength(2);
    expect(report.runs[0]!.initialStateHash).toBe(report.runs[1]!.initialStateHash);
    expect(report.runs[0]!.runId).not.toBe(report.runs[1]!.runId);
    for (const run of report.runs) {
      expect(run.receipts).toHaveLength(1);
      expect(run.receipts[0]).toMatchObject({
        cost: 1,
        origin: 'OPERATOR_VERIFICATION',
        reason: 'COLLECTED',
      });
      expect(run.metrics).toMatchObject({
        unsupportedFactualAssertions: null,
        assertionReview: 'NOT_AUTOMATED',
        remainingVerificationCapacity: 4,
        adaptation: 'INAPPROPRIATE',
        verificationCollected: true,
      });
    }
  });
  it('retains the one failed Astra attempt without reroll, substitution or fake verification', async () => {
    const choose = vi.fn(async () => {
      throw new Error('private-provider-failure');
    });
    const applyChange = vi.fn();
    const config = options();
    config.planners = [
      { id: 'ASTRA', version: 'test-1', model: 'gpt-6-astra', mode: 'MOCK', planner: { choose } },
    ];
    config.factory = (_v, _p, id) => ({ ...environment(id), applyChange });
    const report = await runComparison(config);
    expect(choose).toHaveBeenCalledTimes(1);
    expect(applyChange).not.toHaveBeenCalled();
    expect(report.runs[0]).toMatchObject({
      status: 'PLANNER_FAILED',
      firstChoice: null,
      receipts: [],
      metrics: { adaptation: 'INDETERMINATE', verificationCollected: false },
    });
    expect(JSON.stringify(report)).not.toContain('private-provider-failure');
  });
  it('rejects reused ledgers or unequal initial knowledge', async () => {
    const shared = environment('shared');
    const config = options();
    config.factory = () => shared;
    await expect(runComparison(config)).rejects.toThrow('independent fresh');
    const unequal = options();
    unequal.factory = (_v, planner, id) => {
      const env = environment(id);
      if (planner === 'COVERAGE') env.session.observations.push({ ...observation(), runId: id });
      return env;
    };
    await expect(runComparison(unequal)).rejects.toThrow('starting states differ');
  });
  it('scores later decisions against the changed remaining budget without refilling it', async () => {
    let step = 0;
    const config = options();
    config.planners = [
      {
        id: 'ASTRA',
        version: 'test-1',
        model: 'gpt-6-astra',
        mode: 'MOCK',
        planner: {
          choose: async () =>
            ++step <= 4
              ? {
                  type: 'INVESTIGATE',
                  actionId: 'INV-JENKINS-VERSION',
                  target: 'Jenkins-02',
                  hypothesisIds: ['HYP-002'],
                  rationale: 'Retry failed collection.',
                }
              : { type: 'STOP', rationale: 'No remaining credits.' },
        },
      },
    ];
    config.factory = (_v, _p, id) => ({
      ...environment(id),
      collector: async () => {
        throw new Error('offline failure');
      },
    });
    const run = (await runComparison(config)).runs[0]!;
    expect(run.adaptationDecisions.map((d) => d.outcome)).toEqual([
      'APPROPRIATE',
      'APPROPRIATE',
      'APPROPRIATE',
      'INAPPROPRIATE',
      'APPROPRIATE',
    ]);
    expect(run.metrics).toMatchObject({
      remainingVerificationCapacity: 0,
      collectionFailures: 4,
      verificationCollected: false,
    });
    expect(run.status).toBe('VERIFICATION_FAILED');
  });
});
