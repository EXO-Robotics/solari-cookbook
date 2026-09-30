import { performance } from 'node:perf_hooks';
import { CaseController, CommandError } from './controller.ts';

/** Explicitly enabled disposable-profile demonstration, separate from Safari recovery. */
export class ControlledClickDemo {
  private armed: { runId: string; deadline: number; expiresAt: number } | null = null;
  private readonly accepted = new Map<
    string,
    { runId: string; failed: boolean; deadline: number; revoked: boolean }
  >();
  private closed = false;
  constructor(
    private readonly controller: CaseController,
    private readonly now = () => performance.now(),
    private readonly wall = () => Date.now(),
  ) {}

  arm(runId: string, durationMs = 120_000) {
    if (this.closed) throw new CommandError('CONTROLLER_STOPPING');
    if (!Number.isInteger(durationMs) || durationMs < 1000 || durationMs > 120_000)
      throw new CommandError('INVALID_DEMO_DURATION', 400);
    const snapshot = this.controller.snapshot(runId);
    if (
      snapshot.workflow !== 'DETECTOR' ||
      !snapshot.authorization ||
      snapshot.execution !== 'READY'
    )
      throw new CommandError('AUTHORIZED_READY_CASE_REQUIRED');
    if (this.accepted.size >= 25) throw new CommandError('DEMO_LIMIT_RESTART_REQUIRED', 429);
    if (this.armed && this.now() < this.armed.deadline)
      throw new CommandError('DEMO_ALREADY_ARMED');
    this.armed = { runId, deadline: this.now() + durationMs, expiresAt: this.wall() + durationMs };
    return { runId, expiresAt: this.armed.expiresAt };
  }
  entry(fixtureId: string, requestId: string) {
    if (this.closed) throw new CommandError('CONTROLLER_STOPPING');
    if (fixtureId !== 'acme-login') throw new CommandError('UNREGISTERED_FIXTURE', 400);
    const existing = this.accepted.get(requestId);
    if (existing) return { runId: existing.runId };
    const lease = this.armed;
    if (!lease || this.now() >= lease.deadline) {
      this.armed = null;
      throw new CommandError('DEMO_NOT_ARMED');
    }
    // Consume admission before any async work. This cannot arm the Safari lease.
    this.armed = null;
    this.controller.revokeEntry();
    const record = { runId: lease.runId, failed: false, deadline: lease.deadline, revoked: false };
    this.accepted.set(requestId, record);
    void this.controller
      .inspect(lease.runId, fixtureId, requestId, 'CHROME_HANDOFF')
      .then((snapshot) => {
        if (snapshot.link.release)
          record.deadline = Math.min(
            record.deadline,
            this.now() + Date.parse(snapshot.link.release.expiresAt) - this.wall(),
          );
      })
      .catch(() => {
        record.failed = true;
      });
    return { runId: lease.runId };
  }
  status(requestId: string) {
    const entry = this.accepted.get(requestId);
    if (!entry) throw new CommandError('DEMO_REQUEST_UNKNOWN', 404);
    if (entry.failed) return { state: 'ERROR' as const, requestId, runId: entry.runId };
    const snapshot = this.controller.snapshot(entry.runId);
    if (snapshot.execution === 'READY' || snapshot.execution === 'INSPECTING')
      return { state: 'CHECKING' as const, requestId, runId: entry.runId };
    const release = snapshot.link.release;
    // A wall-clock rollback must never revive or extend a consumed policy grant.
    if (release)
      entry.deadline = Math.min(
        entry.deadline,
        this.now() + Date.parse(release.expiresAt) - this.wall(),
      );
    const freshRelease =
      !this.closed &&
      !entry.revoked &&
      this.now() < entry.deadline &&
      snapshot.link.decision === 'RELEASE' &&
      release &&
      this.wall() < Date.parse(release.expiresAt);
    if (snapshot.link.decision === 'RELEASE' && !freshRelease) entry.revoked = true;
    return {
      state: 'COMPLETE' as const,
      requestId,
      runId: entry.runId,
      classification: snapshot.link.classification,
      execution: snapshot.link.execution,
      decision:
        snapshot.link.decision === 'RELEASE' && !freshRelease ? 'REVIEW' : snapshot.link.decision,
      ...(freshRelease ? { release } : {}),
      cleanup: snapshot.link.cleanup.state,
    };
  }
  disarm() {
    this.armed = null;
    for (const entry of this.accepted.values()) entry.revoked = true;
    return { armed: false };
  }
  close() {
    this.closed = true;
    this.disarm();
  }
}
