import { describe, expect, it } from 'vitest';
import { ClickTiming, clickTimingCsv } from '../../src/ui/interaction-timing.js';
import { CaseController } from '../../src/server/runtime/controller.js';
import { createMockInspector } from '../../src/server/isolation/index.js';

async function completed() {
  const controller = new CaseController({
    workflow: 'DETECTOR',
    inspectionSource: 'SOLARI_SANDBOX',
    inspector: createMockInspector('SOLARI_SANDBOX'),
    planner: {
      choose: async () => {
        throw new Error('Astra must not be called');
      },
    },
    inspectionMode: 'MOCK',
    plannerMode: 'MOCK',
    approvedIdpOrigins: ['https://idp.acme.invalid'],
  });
  const run = controller.create().identity.runId;
  const ready = controller.authorize(run, {
    scenario: 'OWNED_FIXTURE_INSPECTION',
    assumptions: [],
    change: 'NONE',
  });
  const snapshot = await controller.inspect(run, 'acme-login', 'request-1', 'OPERATOR_DIRECT');
  return { ready, snapshot, run };
}
function clock() {
  let now = 1000;
  let wall = '2026-09-29T12:00:00.000Z';
  let visibility = 'visible';
  return {
    now: () => now,
    wall: () => wall,
    visibility: () => visibility,
    advance: (ms: number) => {
      now += ms;
    },
    setWall: (value: string) => {
      wall = value;
    },
    hide: () => {
      visibility = 'hidden';
    },
  };
}

describe('direct operator click timing', () => {
  it('correlates the actual case and separates monotonic UI duration from server timestamps', async () => {
    const { snapshot, run } = await completed();
    const time = clock();
    const timing = new ClickTiming(run, 'request-1', 'MOCK', 'SOLARI_SANDBOX', time);
    time.advance(2);
    timing.dispatch();
    time.advance(1400);
    timing.responseParsed(snapshot);
    // A wall clock correction cannot change the browser monotonic duration.
    time.setWall('2026-09-29T11:00:00.000Z');
    time.advance(4);
    const record = timing.commit(snapshot)!;
    expect(record.offsetsMs).toEqual({
      requestDispatched: 2,
      responseParsed: 1402,
      resultCommitted: 1406,
    });
    expect(record.durationsMs).toMatchObject({
      clickToResultCommit: 1406,
      requestToResponse: 1400,
      responseToCommit: 4,
    });
    expect(record.serverTiming).toEqual(snapshot.link.timing);
    expect(record.warmSession).toBeNull();
    expect(record).toMatchObject({
      requestId: 'request-1',
      runId: run,
      mode: 'MOCK',
      provider: 'SOLARI_SANDBOX',
      path: 'DIRECT_OPERATOR_CLICK',
      interceptionVerified: false,
      navigationReleased: false,
      screenshotLoadIncluded: false,
      physicalPaintVerified: false,
      astraStatus: 'NOT_INVOKED',
    });
    expect(JSON.stringify(record)).not.toContain('observation');
    expect(timing.commit(snapshot)).toBeNull();
    expect(timing.fail()).toBeNull();
  });
  it('does not attribute stale, pending, mismatched-provider, or handoff results to the click', async () => {
    const { ready, snapshot, run } = await completed();
    const timing = new ClickTiming(run, 'request-1', 'MOCK', 'SOLARI_SANDBOX', clock());
    expect(timing.commit(snapshot)).toBeNull();
    timing.dispatch();
    timing.responseParsed(snapshot);
    expect(timing.commit(ready)).toBeNull();
    expect(
      timing.commit({
        ...snapshot,
        identity: { ...snapshot.identity, revision: snapshot.identity.revision + 1 },
      }),
    ).toBeNull();
    expect(
      timing.commit({
        ...snapshot,
        link: {
          ...snapshot.link,
          timing: { ...snapshot.link.timing, returnedAt: '2026-01-01T00:00:00.000Z' },
        },
      }),
    ).toBeNull();
    expect(
      timing.commit({ ...snapshot, identity: { ...snapshot.identity, runId: 'another-run' } }),
    ).toBeNull();
    expect(timing.commit({ ...snapshot, inspectionTrigger: 'SAFARI_HANDOFF' })).toBeNull();
    expect(
      timing.commit({ ...snapshot, link: { ...snapshot.link, source: 'VERCEL_SANDBOX' } }),
    ).toBeNull();
    expect(timing.commit({ ...snapshot, workflow: 'SYNTHETIC' })).toBeNull();
    expect(timing.commit(snapshot)?.status).toBe('RESULT_COMMITTED');
  });
  it('records request failures without inventing a decision or finished latency', async () => {
    const { run } = await completed();
    const time = clock();
    const timing = new ClickTiming(run, 'request-1', 'LIVE', 'SOLARI_SANDBOX', time);
    timing.dispatch();
    time.advance(200);
    time.hide();
    const record = timing.fail()!;
    expect(record).toMatchObject({
      status: 'REQUEST_FAILED',
      classification: null,
      serverTiming: null,
      visibilityAtStart: 'visible',
      visibilityAtFinish: 'hidden',
    });
    expect(record.durationsMs).toEqual({
      clickToResultCommit: null,
      requestToResponse: null,
      responseToCommit: null,
      serverInspectionToDecision: null,
    });
    expect(record.offsetsMs.resultCommitted).toBeNull();
    expect(timing.fail()).toBeNull();
  });
  it('preserves warm readiness and acquisition on the server clock for cold-fallback analysis', async () => {
    const { snapshot, run } = await completed();
    snapshot.link.session = {
      mode: 'WARM',
      readyAt: '2026-09-29T12:00:36.000Z',
      acquiredAt: '2026-09-29T12:00:36.001Z',
      reused: false,
      inspectionCount: 1,
      disposition: 'RETIRED',
    };
    const timing = new ClickTiming(run, 'request-1', 'MOCK', 'SOLARI_SANDBOX', clock());
    timing.dispatch();
    timing.responseParsed(snapshot);
    const record = timing.commit(snapshot)!;
    expect(record.warmSession).toEqual(snapshot.link.session);
    expect(record.warmSession).not.toBe(snapshot.link.session);
    expect(record.warmSessionReused).toBe(false);
    const csv = clickTimingCsv([record]);
    expect(csv).toContain('"warm_session_ready_at","warm_session_acquired_at"');
    expect(csv).toContain('"2026-09-29T12:00:36.000Z","2026-09-29T12:00:36.001Z"');
  });
  it('exports unit-labelled CSV with honest missing values and no tokens or URLs', async () => {
    const { snapshot, run } = await completed();
    const timing = new ClickTiming(run, 'request-1', 'MOCK', 'SOLARI_SANDBOX', clock());
    timing.dispatch();
    timing.responseParsed(snapshot);
    const csv = clickTimingCsv([timing.commit(snapshot)!]);
    expect(csv).toContain('"click_to_result_commit_ms"');
    expect(csv).toContain('"MOCK","SOLARI_SANDBOX"');
    expect(csv).toContain('"NOT_INVOKED","false","false","false","false"');
    expect(csv.split('\n')).toHaveLength(3);
    expect(csv).not.toMatch(/Bearer|https?:\/\//);
  });
});
