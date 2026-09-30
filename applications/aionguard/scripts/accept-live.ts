import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  ASSUMPTIONS,
  CaseSnapshotSchema,
  CaseReceiptSchema,
  type CaseReceipt,
} from '../src/contracts/index.js';

export type AcceptanceApi = (
  path: string,
  body?: unknown,
  token?: string,
  timeoutMs?: number,
) => Promise<any>;
const failureCodes = new Set([
  'ENTRY_IDEMPOTENCY_FAILED',
  'LIVE_INSPECTION_GATE_FAILED',
  'ASTRA_GATE_FAILED',
  'FRESH_VERIFICATION_BOUNDARY_FAILED',
  'FRESH_VERIFICATION_GATE_FAILED',
  'KEYBOARD_RECOVERY_REQUIRED',
  'PROTECTION_NOT_ARMED',
  'CONTROLLER_STOPPED',
]);
export function acceptanceFailure(error: unknown): string {
  return error instanceof Error && failureCodes.has(error.message)
    ? error.message
    : 'LIVE_ACCEPTANCE_FAILED';
}
const ProtectionStatus = z.object({
  armed: z.boolean(),
  expiresAt: z.number().nullable(),
  recoveryReady: z.boolean(),
  reason: z.enum([
    'NOT_ARMED',
    'RECOVERY_UNAVAILABLE',
    'LEASE_EXPIRED',
    'OPERATOR_ARMED',
    'EMERGENCY_RELEASE',
    'CONTROLLER_STOPPED',
  ]),
  releaseRequestId: z.string().nullable(),
  lastExtensionAck: z
    .object({ requestId: z.string(), rulesRemoved: z.boolean(), at: z.number() })
    .nullable(),
});

export async function acceptanceReceipt(
  api: AcceptanceApi,
  runId: string,
): Promise<CaseReceipt | null> {
  try {
    return CaseReceiptSchema.parse(
      await api(`/api/attempts/${runId}/receipt`, undefined, undefined, 2000),
    );
  } catch {
    return null;
  }
}

export async function writeAcceptanceReport(path: string, report: object) {
  const temporary = `${path}.partial-${randomUUID()}`;
  try {
    await writeFile(temporary, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Failure evidence must survive a dead controller. No raw exception enters the report. */
export async function saveReleasedReport(path: string, report: object, api: AcceptanceApi) {
  let releaseRequestConfirmed = false;
  let protection: z.infer<typeof ProtectionStatus> | null = null;
  try {
    releaseRequestConfirmed =
      (await api('/api/protection/disarm', {}, undefined, 2000))?.armed === false;
  } catch {
    /* Unconfirmed release is explicit below. */
  }
  try {
    protection = ProtectionStatus.parse(await api('/api/protection', undefined, undefined, 2000));
  } catch {
    /* Preserve evidence even when final state cannot be read. */
  }
  const recovery = {
    releaseRequestConfirmed,
    protection,
    protectionStatus: protection ? 'AVAILABLE' : 'UNAVAILABLE',
  };
  await writeAcceptanceReport(path, { ...report, ...recovery });
  return recovery;
}

async function main() {
  // Explicit live HTTP acceptance. Never simulates the real helper's heartbeat.
  if (!process.argv.includes('--live'))
    throw new Error('Use --live to authorize Vercel and Astra calls');
  const port = Number(process.env.AIONGUARD_PORT ?? 4317);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Invalid loopback port');
  const origin = `http://127.0.0.1:${port}`;
  const operator = (await readFile('runtime-data/controller-token', 'utf8')).trim();
  const entry = (await readFile('runtime-data/entry-token', 'utf8')).trim();
  const api: AcceptanceApi = async (path, body, token = operator, timeoutMs = 125000) => {
    const response = await fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const value = await response.json();
    if (!response.ok)
      throw new Error(typeof value.error === 'string' ? value.error : 'HTTP_GATE_FAILED');
    return value;
  };
  if ((await api('/api/health')).mode !== 'LIVE') throw new Error('LIVE_CONTROLLER_REQUIRED');
  if (!(await api('/api/protection')).recoveryReady)
    throw new Error('REAL_KEYBOARD_RECOVERY_REQUIRED');
  const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const files = execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      'src',
      'scripts',
      'package-lock.json',
    ],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  const hashes: Record<string, string> = {};
  for (const file of files)
    hashes[file] = createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
  const results: Array<{
    index: number;
    runId: string | null;
    failure: string | null;
    receipt: CaseReceipt | null;
  }> = [];
  await mkdir('runtime-data/live-acceptance', { recursive: true, mode: 0o700 });
  const reportPath = `runtime-data/live-acceptance/${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.json`;
  const report = () => ({
    schemaVersion: 2,
    kind: 'LIVE_HTTP_INTEGRATION',
    endpointInterceptionVerified: false,
    physicalKeyboardVerified: false,
    sourceRevision,
    sourceHashes: hashes,
    results,
  });
  try {
    for (let index = 0; index < 2; index++) {
      const result: (typeof results)[number] = {
        index,
        runId: null,
        failure: 'ATTEMPT_IN_PROGRESS',
        receipt: null,
      };
      results.push(result);
      // Checkpoint before HTTP: even creation or receipt loss leaves an attempted row.
      await writeAcceptanceReport(reportPath, {
        ...report(),
        protection: null,
        protectionStatus: 'UNAVAILABLE',
        releaseRequestConfirmed: false,
      });
      try {
        const run = CaseSnapshotSchema.parse(await api('/api/attempts', {})).identity.runId;
        result.runId = run;
        await api(`/api/attempts/${run}/authorize`, {
          scenario: 'SYNTHETIC_ASSUMED_COMPROMISE',
          assumptions: ASSUMPTIONS,
          change: 'jenkins.cli_enabled:true->false',
        });
        await api('/api/protection/arm', { runId: run, durationMs: 120000 });
        const command = { fixtureId: 'acme-login', requestId: randomUUID() };
        const accepted = await api('/api/entry', command, entry);
        const duplicate = await api('/api/entry', command, entry);
        if (accepted.runId !== run || duplicate.runId !== run)
          throw new Error('ENTRY_IDEMPOTENCY_FAILED');
        const deadline = Date.now() + 180000;
        let snapshot = CaseSnapshotSchema.parse(await api(`/api/attempts/${run}`));
        while (
          ['INSPECTING', 'INVESTIGATING'].includes(snapshot.execution) &&
          Date.now() < deadline
        ) {
          await new Promise((done) => setTimeout(done, 500));
          snapshot = CaseSnapshotSchema.parse(await api(`/api/attempts/${run}`));
        }
        if (
          snapshot.link.execution !== 'SUCCEEDED' ||
          snapshot.link.classification !== 'SUSPICIOUS' ||
          snapshot.link.cleanup.state !== 'CONFIRMED'
        )
          throw new Error('LIVE_INSPECTION_GATE_FAILED');
        if (
          snapshot.execution === 'MODEL_UNAVAILABLE' ||
          !snapshot.events.some((e) => e.type === 'PLANNER_DECIDED')
        )
          throw new Error('ASTRA_GATE_FAILED');
        snapshot = CaseSnapshotSchema.parse(
          await api(`/api/attempts/${run}/harden`, {
            requestId: randomUUID(),
            revision: snapshot.identity.revision,
          }),
        );
        if (snapshot.verification !== 'REQUIRED' || snapshot.summary.verifiedAfterState)
          throw new Error('FRESH_VERIFICATION_BOUNDARY_FAILED');
        snapshot = CaseSnapshotSchema.parse(
          await api(`/api/attempts/${run}/verify`, {
            requestId: randomUUID(),
            revision: snapshot.identity.revision,
          }),
        );
        if (snapshot.verification !== 'VERIFIED' || !snapshot.summary.verifiedAfterState)
          throw new Error('FRESH_VERIFICATION_GATE_FAILED');
        result.failure = null;
      } catch (error) {
        result.failure = acceptanceFailure(error);
      }
      if (result.runId) result.receipt = await acceptanceReceipt(api, result.runId);
      if (!result.receipt) result.failure ??= 'RECEIPT_UNAVAILABLE';
      const recovery = await saveReleasedReport(reportPath, report(), api);
      if (!recovery.releaseRequestConfirmed || recovery.protection?.armed !== false) {
        result.failure ??= 'RELEASE_UNCONFIRMED';
        process.exitCode = 1;
      }
      console.info(
        JSON.stringify({
          index,
          runId: result.runId,
          failure: result.failure,
          reportPath,
          cleanup: result.receipt?.snapshot.link.cleanup.state ?? 'UNAVAILABLE',
        }),
      );
      if (result.failure) {
        process.exitCode = 1;
        break;
      }
    }
  } finally {
    const recovery = await saveReleasedReport(reportPath, report(), api);
    if (!recovery.releaseRequestConfirmed || recovery.protection?.armed !== false)
      process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await main();
