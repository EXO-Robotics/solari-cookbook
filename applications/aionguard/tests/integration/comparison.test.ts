import { describe, it, expect } from 'vitest';
import { projectComparison } from '../../src/server/runtime/comparison.js';
const hash = 'a'.repeat(64);
const row = {
  plannerId: 'COVERAGE',
  policyVersion: 'coverage-1',
  model: null,
  mode: 'MOCK',
  initialStateHash: hash,
  scenarioVersion: 'acme-1',
  actionContractVersion: 'actions-1',
  status: 'COMPLETED',
  firstChoice: 'INV-ACTIVITY-LEDGER',
  baselineAssessments: [],
  metrics: {
    remainingVerificationCapacity: 1,
    adaptation: 'APPROPRIATE',
    verificationCollected: true,
  },
  privateTruth: 'must never project',
};
const report = {
  comparisonVersion: 'comparison-1',
  generatedAt: new Date().toISOString(),
  runs: [row],
};
describe('precomputed comparison boundary', () => {
  it('requires initial state, scenario, action and policy version match', () => {
    expect(projectComparison(report, null)).toBe(null);
    expect(projectComparison(report, 'b'.repeat(64))).toBe(null);
    expect(projectComparison({ ...report, runs: [{ ...row, scenarioVersion: 'old' }] }, hash)).toBe(
      null,
    );
    expect(projectComparison({ ...report, runs: [{ ...row, policyVersion: 'old' }] }, hash)).toBe(
      null,
    );
    expect(
      projectComparison({ ...report, runs: [{ ...row, actionContractVersion: 'old' }] }, hash),
    ).toBe(null);
  });
  it('projects only display metrics, rejects duplicate planner rows, never implies Astra ran', () => {
    const result = projectComparison(report, hash);
    expect(result?.actualAstraMeasured).toBe(false);
    expect(JSON.stringify(result)).not.toContain('privateTruth');
    expect(projectComparison({ ...report, runs: [row, row] }, hash)).toBe(null);
  });
  it('does not claim a model was measured when its transport failed before a decision', () => {
    const failed = {
      ...row,
      plannerId: 'ASTRA',
      policyVersion: 'astra-cli-2',
      model: 'gpt-6-astra',
      mode: 'LIVE',
      firstChoice: null,
      status: 'PLANNER_FAILED',
    };
    expect(projectComparison({ ...report, runs: [failed] }, hash)?.actualAstraMeasured).toBe(false);
  });
});
