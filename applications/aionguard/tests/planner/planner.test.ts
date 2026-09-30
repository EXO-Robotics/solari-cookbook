import { access, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPlannerView, serializePlannerRequest } from '../../src/server/planner/view.ts';
import {
  CliAstraPlanner,
  runCliProcess,
  type CliInvocation,
  type PlannerTrace,
} from '../../src/server/planner/astra.ts';
import { CoverageAwarePlanner, GreedyPlanner } from '../../src/server/planner/policies.ts';
import { observation, session } from '../broker/helpers.ts';
import type { Assessment, Observation, PlannerView } from '../../src/contracts/index.ts';

const assessments: Assessment[] = [
  {
    hypothesisId: 'HYP-001',
    impact: 'CRITICAL',
    outcome: 'INCONCLUSIVE',
    depth: null,
    ruleIds: [],
    supportingObservationIds: [],
    falsifyingObservationIds: [],
    gaps: ['Principal status missing.'],
    consequenceValidated: false,
  },
  {
    hypothesisId: 'HYP-002',
    impact: 'HIGH',
    outcome: 'INCONCLUSIVE',
    depth: 1,
    ruleIds: [],
    supportingObservationIds: [],
    falsifyingObservationIds: [],
    gaps: ['Version missing.'],
    consequenceValidated: false,
  },
];
function view(): PlannerView {
  const state = session();
  state.observations = [
    {
      ...observation('access'),
      subject: 'Jenkins-02',
      predicate: 'direct_access',
      value: 'REACHABLE',
    },
    { ...observation('product'), subject: 'Jenkins-02', predicate: 'product', value: 'Jenkins' },
    { ...observation('grant'), subject: 'ci-service', predicate: 'staging_grant', value: true },
  ] as Observation[];
  for (const o of state.observations)
    o.source = { ...o.source, kind: 'INITIAL_INVENTORY', actionId: null };
  return buildPlannerView(state, assessments);
}
async function output(invocation: CliInvocation, value: unknown) {
  const file = invocation.args[invocation.args.indexOf('--output-last-message') + 1]!;
  await writeFile(file, JSON.stringify({ decision: value }));
}
const stop = {
  type: 'STOP',
  rationale: 'Preserve verification capacity.',
};

describe('allowlisted planner boundary', () => {
  it('rebuilds opaque IDs and excludes page strings, encoded markers, arbitrary catalog labels and evaluator prose', async () => {
    const marker = 'INJECTION_MARKER';
    const state = session();
    const obs = observation(marker);
    obs.source.reference = marker;
    state.observations = [
      obs,
      {
        ...observation('other'),
        domain: 'INSPECTED_PAGE',
        value: marker,
      } as unknown as Observation,
    ];
    state.catalog[0]!.label = marker;
    (state as unknown as Record<string, unknown>).inspection = {
      title: marker,
      html: marker,
      png: Buffer.from(marker).toString('base64'),
      url: `https://example.test/${marker}`,
    };
    const dirtyAssessments = assessments.map((a) => ({
      ...a,
      ruleIds: [marker],
      gaps: [marker],
      supportingObservationIds: [marker],
    }));
    const projected = buildPlannerView(state, dirtyAssessments);
    expect(projected.facts[0]!.id).toBe('fact_1');
    expect(projected.assessments[0]!.supportingObservationIds).toEqual(['fact_1']);
    // Also exercise the final transport re-projection against a tainted valid view.
    projected.catalog[0]!.label = marker;
    projected.assessments[0]!.gaps = [marker];
    projected.facts[0]!.id = marker;
    let sent: CliInvocation | undefined;
    const planner = new CliAstraPlanner({
      runner: async (invocation) => {
        sent = invocation;
        await output(invocation, stop);
      },
    });
    await planner.choose(projected);
    const allOutgoing = JSON.stringify(sent);
    expect(allOutgoing).not.toContain(marker);
    expect(allOutgoing).not.toContain(Buffer.from(marker).toString('base64'));
    expect(allOutgoing).not.toContain(encodeURIComponent(`https://example.test/${marker}`));
    expect(allOutgoing).not.toContain('INSPECTED_PAGE');
    expect(sent!.args).toContain('--ignore-user-config');
    expect(sent!.args).toContain('project_doc_max_bytes=0');
    expect(sent!.args).toContain('memories.use_memories=false');
    expect(sent!.args).toContain('memories.generate_memories=false');
    expect(sent!.args).toContain('skip_host_skill_discovery');
    for (const feature of ['plugins', 'memories', 'hooks', 'shell_tool', 'computer_use']) {
      const index = sent!.args.indexOf(feature);
      expect(index).toBeGreaterThan(0);
      expect(sent!.args[index - 1]).toBe('--disable');
    }
    expect(sent!.args.at(-1)).toBe('-');
    expect(sent!.input).toBe(serializePlannerRequest(projected));
  });
  it('does not project another run or an invalid subject/value pairing', () => {
    const state = session();
    state.observations = [
      { ...observation('wrongrun'), runId: 'other' },
      { ...observation('wrongsubject'), subject: 'Production' },
    ];
    expect(buildPlannerView(state, assessments).facts).toEqual([]);
  });
  it('only marks complete current authoritative unexpired facts useful', () => {
    const state = session();
    const obs = observation();
    obs.validity.validUntil = '2020-01-01T00:00:00.000Z';
    state.observations = [obs];
    expect(buildPlannerView(state, assessments).facts[0]!.current).toBe(false);
  });
  it('does not describe the E4 consequence boundary as a missing or conflicting prerequisite', () => {
    const evaluated: Assessment[] = assessments.map((a) =>
      a.hypothesisId === 'HYP-002'
        ? {
            ...a,
            outcome: 'RETAINED',
            depth: 4,
            gaps: ['Untrusted evaluator text must not reach the model.'],
          }
        : a,
    );
    const projected = buildPlannerView(session(), evaluated);
    const gap = projected.assessments.find((a) => a.hypothesisId === 'HYP-002')!.gaps;
    expect(gap).toEqual(['Consequence validation is outside this investigation scope.']);
    expect(JSON.stringify(projected)).not.toContain('Untrusted evaluator text');
    expect(serializePlannerRequest(projected)).toContain(
      'Consequence validation is outside this investigation scope.',
    );
  });
});

describe('frozen deterministic policies', () => {
  it('discloses greedy local choice and broader coverage choice', async () => {
    expect(await new GreedyPlanner().choose(view())).toMatchObject({
      type: 'INVESTIGATE',
      actionId: 'INV-PRINCIPAL-STATUS',
    });
    expect(await new CoverageAwarePlanner().choose(view())).toMatchObject({
      type: 'INVESTIGATE',
      actionId: 'INV-ACTIVITY-LEDGER',
    });
  });
  it('adapts coverage to known runtime and visible stale ledger', async () => {
    const known = view();
    known.facts.push({
      id: 'runtime',
      subject: 'Jenkins-02',
      predicate: 'runtime_identity',
      value: 'ci-service',
      current: true,
      complete: true,
      authoritative: true,
    });
    expect(await new CoverageAwarePlanner().choose(known)).toMatchObject({
      actionId: 'INV-PRINCIPAL-STATUS',
    });
    const stale = view();
    const ledger = stale.catalog.find((a) => a.id === 'INV-ACTIVITY-LEDGER')!;
    ledger.sourceCurrent = false;
    ledger.sourceComplete = false;
    expect(await new CoverageAwarePlanner().choose(stale)).toMatchObject({
      actionId: 'INV-PRINCIPAL-STATUS',
    });
  });
  it('never counts irrelevant age/authentication-history/plugin fields toward utility and reserves one credit', async () => {
    const constrained = view();
    constrained.budget = { total: 4, spent: 3, remaining: 1 };
    expect(await new CoverageAwarePlanner().choose(constrained)).toMatchObject({ type: 'STOP' });
    expect(await new GreedyPlanner().choose(constrained)).toMatchObject({ type: 'STOP' });
    const noUseful = view();
    noUseful.catalog = noUseful.catalog.filter((a) =>
      ['INV-CREDENTIAL-AGE', 'INV-JENKINS-PLUGINS', 'INV-PRODUCTION-MAP'].includes(a.id),
    );
    expect(await new CoverageAwarePlanner().choose(noUseful)).toMatchObject({ type: 'STOP' });
  });
});

describe('structured Astra CLI adapter without live model calls', () => {
  it('parses strict output, sanitizes traces and cleans isolated files', async () => {
    let cwd = '';
    let trace: PlannerTrace | undefined;
    const planner = new CliAstraPlanner({
      onTrace: (t) => {
        trace = t;
      },
      runner: async (invocation) => {
        cwd = invocation.cwd;
        await output(invocation, stop);
      },
    });
    expect(await planner.choose(view())).toEqual({ type: 'STOP', rationale: stop.rationale });
    await expect(access(cwd)).rejects.toThrow();
    expect(trace).toMatchObject({ outcome: 'SUCCEEDED', model: 'gpt-6-astra' });
    expect(JSON.stringify(trace)).not.toContain(stop.rationale);
    expect(JSON.stringify(trace)).not.toContain(cwd);
  });
  it.each([
    { ...stop, verdict: 'safe' },
    { ...stop, actionId: 'INV-JENKINS-CLI' },
    { ...stop, hypothesisIds: ['HYP-001', 'HYP-002'] },
    { ...stop, rationale: '' },
    {
      type: 'INVESTIGATE',
      actionId: 'ARBITRARY_SHELL',
      target: 'Production',
      hypothesisIds: ['HYP-001'],
      rationale: 'x',
    },
    {
      type: 'INVESTIGATE',
      actionId: 'INV-JENKINS-CLI',
      target: 'Jenkins-02',
      hypothesisIds: ['HYP-002', 'HYP-002'],
      rationale: 'x',
    },
  ])('rejects malformed, overpowered or contradictory structured output %#', async (invalid) => {
    const planner = new CliAstraPlanner({ runner: (i) => output(i, invalid) });
    await expect(planner.choose(view())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('rejects missing output, excessive output, symlinks and missing executable', async () => {
    await expect(
      new CliAstraPlanner({ runner: async () => {} }).choose(view()),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(
      new CliAstraPlanner({
        runner: (i) => output(i, { ...stop, rationale: 'a'.repeat(17_000) }),
      }).choose(view()),
    ).rejects.toMatchObject({ code: 'OUTPUT_LIMIT' });
    const directory = await mkdtemp(path.join(tmpdir(), 'aionguard-output-test-'));
    try {
      const file = path.join(directory, 'valid.json');
      await writeFile(file, JSON.stringify({ decision: stop }));
      const planner = new CliAstraPlanner({
        runner: async (i) => {
          await symlink(file, i.args[i.args.indexOf('--output-last-message') + 1]!);
        },
      });
      await expect(planner.choose(view())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
      await expect(
        new CliAstraPlanner({ executable: '/nonexistent/aionguard-codex' }).choose(view()),
      ).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('kills timed-out child processes and rejects tool activity if flags were ignored', async () => {
    await expect(
      runCliProcess({
        executable: process.execPath,
        args: ['-e', 'setInterval(()=>{},1000)'],
        input: '',
        cwd: tmpdir(),
        timeoutMs: 50,
      }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    const toolEvent = JSON.stringify({
      type: 'item.completed',
      item: { type: 'command_execution', command: 'unexpected' },
    });
    await expect(
      runCliProcess({
        executable: process.execPath,
        args: ['-e', `process.stdout.write(${JSON.stringify(toolEvent + '\n')})`],
        input: '',
        cwd: tmpdir(),
        timeoutMs: 2000,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('does not inherit provider-token environment variables', async () => {
    process.env.AIONGUARD_TEST_SECRET = 'marker';
    try {
      await expect(
        runCliProcess({
          executable: process.execPath,
          args: [
            '-e',
            `if (process.env.AIONGUARD_TEST_SECRET) process.exit(2); process.stdout.write('${JSON.stringify({ type: 'turn.started' })}\\n${JSON.stringify({ type: 'turn.completed' })}\\n')`,
          ],
          input: '',
          cwd: tmpdir(),
          timeoutMs: 2000,
        }),
      ).resolves.toBeUndefined();
    } finally {
      delete process.env.AIONGUARD_TEST_SECRET;
    }
  });
  it.each([
    [{}, 'INVALID_RESPONSE'],
    [{ type: 'capability.invoked' }, 'INVALID_RESPONSE'],
    [{ type: 'item.completed', item: { type: 'error' } }, 'TRANSPORT_FAILED'],
    [{ type: 'turn.completed' }, 'INVALID_RESPONSE'],
    [{ type: 'turn.started' }, 'TRANSPORT_FAILED'],
  ])('rejects an invalid or incomplete CLI lifecycle %#', async (event, code) => {
    await expect(
      runCliProcess({
        executable: process.execPath,
        args: ['-e', `process.stdout.write(${JSON.stringify(JSON.stringify(event) + '\n')})`],
        input: '',
        cwd: tmpdir(),
        timeoutMs: 2000,
      }),
    ).rejects.toMatchObject({ code });
  });
});
