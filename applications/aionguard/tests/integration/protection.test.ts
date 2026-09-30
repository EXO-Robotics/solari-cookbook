import { describe, expect, it } from 'vitest';
import { ProtectionLease } from '../../src/server/runtime/protection.js';

function setup() {
  let clock = 100;
  let revoked = 0;
  const lease = new ProtectionLease(
    () => revoked++,
    () => clock,
    () => 100000 + clock,
  );
  return {
    lease,
    advance: (ms: number) => {
      clock += ms;
    },
    revoked: () => revoked,
  };
}
describe('reversible protection lease', () => {
  it('never permits delayed commands or heartbeats to rearm a shutting-down controller', () => {
    const { lease } = setup();
    lease.heartbeat(true);
    lease.arm();
    lease.shutdown();
    expect(lease.heartbeat(true)).toMatchObject({ armed: false, recoveryReady: false });
    expect(() => lease.arm()).toThrow('CONTROLLER_STOPPING');
  });
  it('binds browser removal acknowledgment to the current release and clears it on rearm', () => {
    const { lease } = setup();
    lease.heartbeat(true);
    lease.arm();
    lease.disarm('EMERGENCY_RELEASE', 'release-1');
    expect(() => lease.acknowledgeExtension('old-release', true)).toThrow('STALE_RELEASE_ACK');
    expect(lease.acknowledgeExtension('release-1', false).lastExtensionAck?.rulesRemoved).toBe(
      false,
    );
    expect(lease.acknowledgeExtension('release-1', true).lastExtensionAck?.rulesRemoved).toBe(true);
    lease.heartbeat(false);
    expect(lease.status().releaseRequestId).toBe('release-1');
    lease.heartbeat(true);
    expect(lease.arm().lastExtensionAck).toBeNull();
    expect(() => lease.acknowledgeExtension('release-1', true)).toThrow('STALE_RELEASE_ACK');
    lease.disarm('EMERGENCY_RELEASE', 'release-2');
    expect(lease.status().lastExtensionAck).toBeNull();
  });
  it('cannot arm without current keyboard recovery readiness', () => {
    const { lease, advance } = setup();
    expect(lease.status().armed).toBe(false);
    expect(() => lease.arm()).toThrow('KEYBOARD_RECOVERY_REQUIRED');
    lease.heartbeat(true);
    expect(lease.arm().armed).toBe(true);
    advance(3000);
    expect(lease.status()).toMatchObject({ armed: false, recoveryReady: false });
    expect(() => lease.arm()).toThrow('KEYBOARD_RECOVERY_REQUIRED');
  });
  it('a recovered helper never restores revoked protection automatically', () => {
    const { lease, advance, revoked } = setup();
    lease.heartbeat(true);
    const first = lease.arm();
    advance(3001);
    expect(lease.heartbeat(true).armed).toBe(false);
    expect(revoked()).toBe(1);
    expect(lease.arm().leaseId).not.toBe(first.leaseId);
    lease.disarm();
    expect(lease.heartbeat(true).armed).toBe(false);
  });
  it('losing event visibility revokes immediately and needs explicit rearming', () => {
    const { lease } = setup();
    lease.heartbeat(true);
    lease.arm();
    expect(lease.heartbeat(false)).toMatchObject({ armed: false, reason: 'RECOVERY_UNAVAILABLE' });
    expect(lease.heartbeat(true).armed).toBe(false);
  });
  it('expires despite continuous heartbeats and bounds test duration', () => {
    const { lease, advance } = setup();
    lease.heartbeat(true);
    lease.arm(1000);
    advance(1000);
    expect(lease.heartbeat(true)).toMatchObject({ armed: false, reason: 'LEASE_EXPIRED' });
    for (const duration of [0, -1, 300001, Infinity, 1500.5])
      expect(() => lease.arm(duration)).toThrow('INVALID_PROTECTION_DURATION');
  });
  it('restart starts unarmed and repeated emergency release is harmless', () => {
    const { lease } = setup();
    lease.heartbeat(true);
    lease.arm();
    lease.disarm();
    lease.disarm();
    expect(lease.status().armed).toBe(false);
    expect(new ProtectionLease().status()).toMatchObject({ armed: false, recoveryReady: false });
  });
});
