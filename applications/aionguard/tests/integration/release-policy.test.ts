import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { InspectionResult, LinkAssessment } from '../../src/contracts/index.js';
import { CaseController, assessLink } from '../../src/server/runtime/controller.js';
import { ControlledClickDemo } from '../../src/server/runtime/controlled-click.js';
import { createMockInspector } from '../../src/server/isolation/index.js';
import { MockPlanner } from '../../src/server/planner/index.js';
import { applyReleasePolicy } from '../../src/server/runtime/release-policy.js';

const url = 'https://fixture.example.org/benign.html';
const authorization = { scenario: 'OWNED_FIXTURE_INSPECTION', assumptions: [], change: 'NONE' };
async function benign(): Promise<InspectionResult> {
  const result = await createMockInspector('SOLARI_SANDBOX').inspect('acme-login');
  return {
    ...result,
    mode: 'LIVE',
    observation: {
      ...result.observation!,
      finalUrl: url,
      title: 'Owned benign fixture',
      text: 'A static information page.',
      claimedService: 'UNKNOWN',
      passwordField: false,
      formAction: null,
      formDestinationOrigin: null,
      downloadLinks: [],
    },
  };
}
async function assessment() {
  const result = await benign();
  return assessLink(result, result.createdAt!, 'run_policy', [], true);
}
const policy = { url };

describe('completed no-findings release policy', () => {
  it('grants policy release while retaining the undetermined detector classification', async () => {
    const link = await assessment();
    const actual = applyReleasePolicy(link, policy, 'CHROME_HANDOFF');
    expect(actual.decision).toBe('RELEASE');
    expect(actual.classification).toBe('UNDETERMINED');
    expect(actual.release).toEqual({
      url,
      policy: 'NO_FINDINGS_V1',
      expiresAt: new Date(Date.parse(link.observation!.observedAt) + 15000).toISOString(),
    });
  });
  it('no findings without a registered navigation target remains review', async () => {
    expect(applyReleasePolicy(await assessment(), undefined, 'CHROME_HANDOFF').decision).toBe(
      'REVIEW',
    );
  });
  it('cannot grant authority through direct, Safari, mock, unavailable, or stale evidence', async () => {
    const link = await assessment();
    for (const trigger of ['SAFARI_HANDOFF', 'OPERATOR_DIRECT', 'MOCK', 'NOT_STARTED'])
      expect(applyReleasePolicy(link, policy, trigger).decision).toBe('REVIEW');
    const mutations: Partial<LinkAssessment>[] = [
      { mode: 'MOCK' },
      { execution: 'UNAVAILABLE' },
      { classification: 'INSPECTION_UNAVAILABLE' },
      { imagePath: null },
      { failure: 'TIMEOUT' },
      { observation: null },
      ...['UNRESOLVED', 'NOT_CREATED', 'PENDING'].map(
        (state) => ({ cleanup: { ...link.cleanup, state } }) as Partial<LinkAssessment>,
      ),
    ];
    for (const change of mutations)
      expect(applyReleasePolicy({ ...link, ...change }, policy, 'CHROME_HANDOFF').decision).toBe(
        'REVIEW',
      );
    const now = Date.parse(link.observation!.observedAt);
    expect(applyReleasePolicy(link, policy, 'CHROME_HANDOFF', now + 15000).decision).toBe('REVIEW');
    expect(applyReleasePolicy(link, policy, 'CHROME_HANDOFF', now - 1).decision).toBe('REVIEW');
  });
  it('rejects mismatched final URLs and redirect chains', async () => {
    const link = await assessment();
    const mutations = [
      { finalUrl: url + '?x=1' },
      { finalUrl: url + '#x' },
      { finalUrl: url.replace('fixture.', 'attacker.') },
      { redirects: ['https://fixture.example.org/redirect.html'] },
    ];
    for (const change of mutations)
      expect(
        applyReleasePolicy(
          { ...link, observation: { ...link.observation!, ...change } },
          policy,
          'CHROME_HANDOFF',
        ).decision,
      ).toBe('REVIEW');
  });
  it('a finding overrides a grant and cannot carry stale release metadata', async () => {
    const link = await assessment();
    const granted = applyReleasePolicy(link, policy, 'CHROME_HANDOFF');
    const blocked = applyReleasePolicy(
      { ...granted, classification: 'SUSPICIOUS' },
      policy,
      'CHROME_HANDOFF',
    );
    expect(blocked.decision).toBe('BLOCK');
    expect(blocked.release).toBeUndefined();
  });
  it('controller validates evidence before policy and records a grant rather than actual navigation', async () => {
    const controller = new CaseController({
      workflow: 'DETECTOR',
      releasePolicy: policy,
      inspector: { inspect: benign },
      inspectionSource: 'SOLARI_SANDBOX',
      inspectionMode: 'LIVE',
      planner: new MockPlanner(),
      plannerMode: 'MOCK',
      approvedIdpOrigins: [],
    });
    const run = controller.create().identity.runId;
    controller.authorize(run, authorization);
    const result = await controller.inspect(run, 'acme-login', randomUUID(), 'CHROME_HANDOFF');
    expect(result.execution).toBe('RELEASE_READY');
    expect(result.link.decision).toBe('RELEASE');
    expect(result.events.some((e) => e.type === 'POLICY_RELEASE_GRANTED')).toBe(true);
    expect(result.events.some((e) => e.type === 'LINK_BLOCKED')).toBe(false);
  });
  it('invalid PNG blocks release even with a registered destination', async () => {
    const result = await benign();
    result.pngBase64 = 'invalid';
    const link = assessLink(result, result.createdAt!, 'run_invalid', [], true);
    expect(applyReleasePolicy(link, policy, 'CHROME_HANDOFF').decision).toBe('REVIEW');
  });
  it('status strips expired release metadata', async () => {
    const controller = new CaseController({
      workflow: 'DETECTOR',
      releasePolicy: policy,
      inspector: { inspect: benign },
      inspectionSource: 'SOLARI_SANDBOX',
      inspectionMode: 'LIVE',
      planner: new MockPlanner(),
      plannerMode: 'MOCK',
      approvedIdpOrigins: [],
    });
    const run = controller.create().identity.runId;
    controller.authorize(run, authorization);
    let wall = Date.now();
    const demo = new ControlledClickDemo(controller, undefined, () => wall);
    demo.arm(run);
    const requestId = randomUUID();
    demo.entry('acme-login', requestId);
    await controller.inspect(run, 'acme-login', requestId, 'CHROME_HANDOFF');
    expect(demo.status(requestId)).toMatchObject({ decision: 'RELEASE', release: { url } });
    wall += 20000;
    expect(demo.status(requestId)).toMatchObject({ decision: 'REVIEW' });
    expect(demo.status(requestId)).not.toHaveProperty('release');
    wall -= 20000;
    expect(demo.status(requestId)).toMatchObject({ decision: 'REVIEW' });
  });
  it.each(['disarm', 'close'] as const)('%s revokes an already granted release', async (action) => {
    const controller = new CaseController({
      workflow: 'DETECTOR',
      releasePolicy: policy,
      inspector: { inspect: benign },
      inspectionSource: 'SOLARI_SANDBOX',
      inspectionMode: 'LIVE',
      planner: new MockPlanner(),
      plannerMode: 'MOCK',
      approvedIdpOrigins: [],
    });
    const run = controller.create().identity.runId;
    controller.authorize(run, authorization);
    const demo = new ControlledClickDemo(controller);
    demo.arm(run);
    const requestId = randomUUID();
    demo.entry('acme-login', requestId);
    await controller.inspect(run, 'acme-login', requestId, 'CHROME_HANDOFF');
    expect(demo.status(requestId)).toMatchObject({ decision: 'RELEASE' });
    demo[action]();
    expect(demo.status(requestId)).toMatchObject({ decision: 'REVIEW' });
    expect(demo.status(requestId)).not.toHaveProperty('release');
  });
});
