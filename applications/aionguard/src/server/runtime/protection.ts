import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { CommandError } from './controller.js';

/** Volatile, explicitly armed protection. A missing recovery listener revokes the lease. */
export class ProtectionLease {
  private heartbeatAt = -Infinity;
  private ready = false;
  private deadline = 0;
  private expiresAt: number | null = null;
  private leaseId: string | null = null;
  private reason = 'NOT_ARMED';
  private shuttingDown = false;
  private releaseRequestId: string | null = null;
  private lastExtensionAck: { requestId: string; rulesRemoved: boolean; at: number } | null = null;
  constructor(
    private readonly revoke: () => void = () => {},
    private readonly now = () => performance.now(),
    private readonly wallNow = () => Date.now(),
  ) {}

  status() {
    const recoveryReady = !this.shuttingDown && this.ready && this.now() - this.heartbeatAt < 3000;
    if (this.leaseId && (!recoveryReady || this.now() >= this.deadline))
      this.disarm(!recoveryReady ? 'RECOVERY_UNAVAILABLE' : 'LEASE_EXPIRED');
    return {
      armed: this.leaseId !== null,
      expiresAt: this.expiresAt,
      leaseId: this.leaseId,
      recoveryReady,
      reason: this.reason,
      releaseRequestId: this.releaseRequestId,
      lastExtensionAck: this.lastExtensionAck,
    };
  }

  heartbeat(ready: boolean) {
    if (this.shuttingDown) return this.status();
    // Evaluate expiry before accepting a new heartbeat: recovery never silently rearms.
    this.status();
    this.heartbeatAt = this.now();
    this.ready = ready;
    if (!ready) this.disarm('RECOVERY_UNAVAILABLE');
    return this.status();
  }

  arm(durationMs = 120_000) {
    if (this.shuttingDown) throw new CommandError('CONTROLLER_STOPPING');
    if (!Number.isInteger(durationMs) || durationMs < 1000 || durationMs > 300_000)
      throw new CommandError('INVALID_PROTECTION_DURATION', 400);
    if (!this.status().recoveryReady) throw new CommandError('KEYBOARD_RECOVERY_REQUIRED');
    this.deadline = this.now() + durationMs;
    this.expiresAt = this.wallNow() + durationMs;
    this.leaseId = randomUUID();
    this.reason = 'OPERATOR_ARMED';
    this.releaseRequestId = null;
    this.lastExtensionAck = null;
    return this.status();
  }

  disarm(reason = 'EMERGENCY_RELEASE', requestId?: string) {
    this.leaseId = null;
    this.expiresAt = null;
    this.deadline = 0;
    this.reason = reason;
    const releaseId = requestId ?? this.releaseRequestId ?? randomUUID();
    if (this.releaseRequestId !== releaseId) this.lastExtensionAck = null;
    this.releaseRequestId = releaseId;
    this.revoke();
    return { armed: false, expiresAt: null, leaseId: null, reason };
  }
  acknowledgeExtension(requestId: string, rulesRemoved: boolean) {
    if (this.leaseId || !this.releaseRequestId || requestId !== this.releaseRequestId)
      throw new CommandError('STALE_RELEASE_ACK');
    this.lastExtensionAck = { requestId, rulesRemoved, at: this.wallNow() };
    return this.status();
  }
  shutdown() {
    this.shuttingDown = true;
    this.ready = false;
    this.disarm('CONTROLLER_STOPPED');
  }
}
