import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { superviseLauncher } from '../../scripts/start-protected.ts';
import {
  acceptanceFailure,
  acceptanceReceipt,
  saveReleasedReport,
  writeAcceptanceReport,
  type AcceptanceApi,
} from '../../scripts/accept-live.ts';

function child() {
  return Object.assign(new EventEmitter(), { kill: vi.fn(() => true) }) as unknown as EventEmitter &
    Pick<ChildProcess, 'kill' | 'on'>;
}

describe('integrated launcher process failures', () => {
  it('preserves recovery spawn failure when controller shutdown succeeds', () => {
    const controller = child();
    const recovery = child();
    const codes: number[] = [];
    const lifecycle = superviseLauncher(controller, (code) => codes.push(code));
    lifecycle.attachRecovery(recovery);
    recovery.emit('error', new Error('spawn failed'));
    controller.emit('exit', 0, null);
    expect(codes.at(-1)).toBe(1);
    expect(controller.kill).toHaveBeenCalledTimes(1);
    expect(recovery.kill).toHaveBeenCalledTimes(1);
  });
  it.each([0, 7, null])('treats unexpected recovery exit %s as failure', (code) => {
    const controller = child();
    const recovery = child();
    const codes: number[] = [];
    const lifecycle = superviseLauncher(controller, (value) => codes.push(value));
    lifecycle.attachRecovery(recovery);
    recovery.emit('exit', code, null);
    controller.emit('exit', 0, null);
    expect(codes.at(-1)).toBe(code && code > 0 ? code : 1);
  });
  it('preserves the first startup failure and permits an explicit normal shutdown', () => {
    const controller = child();
    const codes: number[] = [];
    const lifecycle = superviseLauncher(controller, (code) => codes.push(code));
    lifecycle.fail(3);
    lifecycle.fail(9);
    lifecycle.stop();
    controller.emit('exit', 0, null);
    expect(codes.at(-1)).toBe(3);

    const normal = child();
    const recovery = child();
    const normalCodes: number[] = [];
    const normalLifecycle = superviseLauncher(normal, (code) => normalCodes.push(code));
    normalLifecycle.attachRecovery(recovery);
    normalLifecycle.stop();
    recovery.emit('exit', null, 'SIGTERM');
    normal.emit('exit', 0, null);
    expect(normalCodes).toEqual([0]);
  });
});

describe('acceptance evidence when the controller disappears', () => {
  it('retains an attempted row with null receipt/status and unconfirmed release without raw errors', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aionguard-acceptance-test-'));
    try {
      const file = join(directory, 'report.json');
      const secret = 'PRIVATE_TOKEN_MUST_NOT_LEAK';
      const calls: Array<[string, number | undefined]> = [];
      const offline: AcceptanceApi = async (path, _body, _token, timeout) => {
        calls.push([path, timeout]);
        throw new Error(secret);
      };
      const receipt = await acceptanceReceipt(offline, 'test-run');
      expect(receipt).toBeNull();
      const results = [{ index: 0, runId: 'test-run', failure: 'ASTRA_GATE_FAILED', receipt }];
      await writeAcceptanceReport(file, { results, protection: null });
      await saveReleasedReport(file, { results }, offline);
      const bytes = await readFile(file, 'utf8');
      expect(bytes).not.toContain(secret);
      expect(JSON.parse(bytes)).toMatchObject({
        results,
        releaseRequestConfirmed: false,
        protection: null,
        protectionStatus: 'UNAVAILABLE',
      });
      expect(calls).toEqual([
        ['/api/attempts/test-run/receipt', 2000],
        ['/api/protection/disarm', 2000],
        ['/api/protection', 2000],
      ]);
      expect(await readdir(directory)).toEqual(['report.json']);
      expect(acceptanceFailure(new Error(secret))).toBe('LIVE_ACCEPTANCE_FAILED');
      expect(acceptanceFailure(new Error('ASTRA_GATE_FAILED'))).toBe('ASTRA_GATE_FAILED');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('does not invent readable final state after acknowledged release', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aionguard-acceptance-test-'));
    try {
      const api: AcceptanceApi = async (path) => {
        if (path.endsWith('/disarm')) return { armed: false };
        throw new Error('controller stopped');
      };
      const file = join(directory, 'report.json');
      await saveReleasedReport(file, { results: [] }, api);
      expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({
        releaseRequestConfirmed: true,
        protection: null,
        protectionStatus: 'UNAVAILABLE',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
