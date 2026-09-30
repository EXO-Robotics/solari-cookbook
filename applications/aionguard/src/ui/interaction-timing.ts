import type { CaseSnapshot } from '../contracts/index.js';

export interface ClickTimingRecord {
  schemaVersion: '1.0.0';
  interactionId: string;
  requestId: string;
  runId: string;
  path: 'DIRECT_OPERATOR_CLICK';
  workflow: 'DETECTOR';
  mode: CaseSnapshot['modes']['inspection'];
  provider: CaseSnapshot['link']['source'];
  startedAt: string;
  finishedAt: string;
  visibilityAtStart: string;
  visibilityAtFinish: string;
  status: 'RESULT_COMMITTED' | 'REQUEST_FAILED';
  offsetsMs: {
    requestDispatched: number;
    responseParsed: number | null;
    resultCommitted: number | null;
  };
  durationsMs: {
    clickToResultCommit: number | null;
    requestToResponse: number | null;
    responseToCommit: number | null;
    serverInspectionToDecision: number | null;
  };
  serverTiming: CaseSnapshot['link']['timing'] | null;
  classification: CaseSnapshot['link']['classification'] | null;
  inspectionExecution: CaseSnapshot['link']['execution'] | null;
  cleanup: CaseSnapshot['link']['cleanup']['state'] | null;
  warmSessionReused: boolean | null;
  warmSession: NonNullable<CaseSnapshot['link']['session']> | null;
  astraStatus: 'NOT_INVOKED';
  interceptionVerified: false;
  navigationReleased: false;
  screenshotLoadIncluded: false;
  physicalPaintVerified: false;
}

type Clock = { now(): number; wall(): string; visibility(): string };
const browserClock: Clock = {
  now: () => performance.now(),
  wall: () => new Date().toISOString(),
  visibility: () => document.visibilityState,
};
const rounded = (n: number) => Math.round(n * 1000) / 1000;

/** Same-document monotonic timing only. This cannot measure an original Safari link click. */
export class ClickTiming {
  private readonly started: number;
  private readonly startedAt: string;
  private readonly visibilityAtStart: string;
  private dispatched: number | null = null;
  private response: number | null = null;
  private responseIdentity: { revision: number; returnedAt: string | null } | null = null;
  private finished = false;
  constructor(
    readonly runId: string,
    readonly requestId: string,
    private readonly mode: ClickTimingRecord['mode'],
    private readonly provider: ClickTimingRecord['provider'],
    private readonly clock: Clock = browserClock,
  ) {
    this.started = clock.now();
    this.startedAt = clock.wall();
    this.visibilityAtStart = clock.visibility();
  }
  private offset() {
    return rounded(Math.max(0, this.clock.now() - this.started));
  }
  dispatch() {
    if (!this.finished && this.dispatched === null) this.dispatched = this.offset();
  }
  responseParsed(snapshot: CaseSnapshot) {
    if (
      !this.finished &&
      this.dispatched !== null &&
      this.response === null &&
      snapshot.identity.runId === this.runId
    ) {
      this.response = this.offset();
      this.responseIdentity = {
        revision: snapshot.identity.revision,
        returnedAt: snapshot.link.timing.returnedAt,
      };
    }
  }
  commit(snapshot: CaseSnapshot): ClickTimingRecord | null {
    if (
      this.finished ||
      this.response === null ||
      !this.responseIdentity ||
      snapshot.identity.revision !== this.responseIdentity.revision ||
      snapshot.link.timing.returnedAt !== this.responseIdentity.returnedAt ||
      snapshot.identity.runId !== this.runId ||
      snapshot.workflow !== 'DETECTOR' ||
      snapshot.link.execution === 'PENDING' ||
      !['OPERATOR_DIRECT', 'MOCK'].includes(snapshot.inspectionTrigger) ||
      snapshot.modes.inspection !== this.mode ||
      snapshot.link.source !== this.provider
    )
      return null;
    return this.finish(snapshot);
  }
  fail(): ClickTimingRecord | null {
    if (this.finished || this.dispatched === null) return null;
    return this.finish(null);
  }
  private finish(snapshot: CaseSnapshot | null): ClickTimingRecord {
    this.finished = true;
    const end = this.offset();
    const serverTiming = snapshot ? { ...snapshot.link.timing } : null;
    const serverDuration = serverTiming?.blockedAt
      ? Date.parse(serverTiming.blockedAt) - Date.parse(serverTiming.heldAt)
      : null;
    return {
      schemaVersion: '1.0.0',
      interactionId: this.requestId,
      requestId: this.requestId,
      runId: this.runId,
      path: 'DIRECT_OPERATOR_CLICK',
      workflow: 'DETECTOR',
      mode: this.mode,
      provider: this.provider,
      startedAt: this.startedAt,
      finishedAt: this.clock.wall(),
      visibilityAtStart: this.visibilityAtStart,
      visibilityAtFinish: this.clock.visibility(),
      status: snapshot ? 'RESULT_COMMITTED' : 'REQUEST_FAILED',
      offsetsMs: {
        requestDispatched: this.dispatched!,
        responseParsed: this.response,
        resultCommitted: snapshot ? end : null,
      },
      durationsMs: {
        clickToResultCommit: snapshot ? end : null,
        requestToResponse:
          this.response === null ? null : rounded(this.response - this.dispatched!),
        responseToCommit: snapshot && this.response !== null ? rounded(end - this.response) : null,
        serverInspectionToDecision:
          serverDuration !== null && Number.isFinite(serverDuration) && serverDuration >= 0
            ? serverDuration
            : null,
      },
      serverTiming,
      classification: snapshot?.link.classification ?? null,
      inspectionExecution: snapshot?.link.execution ?? null,
      cleanup: snapshot?.link.cleanup.state ?? null,
      warmSessionReused: snapshot?.link.session?.reused ?? null,
      warmSession: snapshot?.link.session ? { ...snapshot.link.session } : null,
      astraStatus: 'NOT_INVOKED',
      interceptionVerified: false,
      navigationReleased: false,
      screenshotLoadIncluded: false,
      physicalPaintVerified: false,
    };
  }
}

export function clickTimingCsv(records: readonly ClickTimingRecord[]): string {
  const header = [
    'interaction_id',
    'request_id',
    'run_id',
    'path',
    'mode',
    'provider',
    'started_at',
    'finished_at',
    'status',
    'visibility_start',
    'visibility_finish',
    'request_dispatched_ms',
    'response_parsed_ms',
    'result_committed_ms',
    'click_to_result_commit_ms',
    'request_to_response_ms',
    'response_to_commit_ms',
    'server_inspection_to_decision_ms',
    'classification',
    'inspection_execution',
    'cleanup',
    'warm_session_reused',
    'warm_session_ready_at',
    'warm_session_acquired_at',
    'astra_status',
    'interception_verified',
    'navigation_released',
    'screenshot_load_included',
    'physical_paint_verified',
  ];
  const rows = records.map((r) => [
    r.interactionId,
    r.requestId,
    r.runId,
    r.path,
    r.mode,
    r.provider,
    r.startedAt,
    r.finishedAt,
    r.status,
    r.visibilityAtStart,
    r.visibilityAtFinish,
    r.offsetsMs.requestDispatched,
    r.offsetsMs.responseParsed,
    r.offsetsMs.resultCommitted,
    r.durationsMs.clickToResultCommit,
    r.durationsMs.requestToResponse,
    r.durationsMs.responseToCommit,
    r.durationsMs.serverInspectionToDecision,
    r.classification,
    r.inspectionExecution,
    r.cleanup,
    r.warmSessionReused,
    r.warmSession?.readyAt,
    r.warmSession?.acquiredAt,
    r.astraStatus,
    r.interceptionVerified,
    r.navigationReleased,
    r.screenshotLoadIncluded,
    r.physicalPaintVerified,
  ]);
  const cell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\n') + '\n';
}
