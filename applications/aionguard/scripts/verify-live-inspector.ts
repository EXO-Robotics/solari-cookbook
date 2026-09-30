import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Sandbox, Snapshot } from '@vercel/sandbox';
import { inspectorConfigFromEnv } from '../src/server/isolation/config.ts';
import { VercelInspector } from '../src/server/isolation/inspector.ts';
import { sdkCredentials } from '../src/server/isolation/provider.ts';

// This command is deliberately excluded from tests, builds, and CI. It consumes provider usage.
assert.equal(process.env.AIONGUARD_LIVE_VERIFY_CONFIRM, 'INSPECT_OWNED_FIXTURE');
const output = resolve(process.argv[2] ?? 'runtime-data/live-inspector-verification.json');
const approval = JSON.parse(
  await readFile(
    process.env.AIONGUARD_SNAPSHOT_APPROVAL_PATH ?? 'runtime-data/snapshot-approval.json',
    'utf8',
  ),
);
const config = inspectorConfigFromEnv(process.env, approval);
assert.ok(config, 'An approved image and explicit live configuration are required');
await writeFile(
  output,
  `${JSON.stringify({ status: 'RUNNING', startedAt: new Date().toISOString() })}\n`,
  { mode: 0o600, flag: 'wx' },
);
const credentials = sdkCredentials(config.credentials);
const inventory = async () =>
  (
    await Sandbox.list({
      ...credentials,
      namePrefix: 'aionguard-',
      sortBy: 'name',
      signal: AbortSignal.timeout(15_000),
    })
  ).toArray();
const before = await inventory();
assert.equal(
  before.length,
  0,
  'Reconcile outstanding AionGuard resources before live verification',
);
const snapshot = await Snapshot.get({
  ...credentials,
  snapshotId: config.snapshot.snapshotId,
  signal: AbortSignal.timeout(15_000),
});
assert.equal(snapshot.status, 'created');
assert.ok(snapshot.expiresAt && snapshot.expiresAt.getTime() > Date.now());
const inspector = new VercelInspector(config);
const runs = [];
let failure: string | null = null;
try {
  const unknown = await inspector.inspect('unregistered-test-input');
  assert.equal(unknown.failure, 'NAVIGATION_DENIED');
  assert.equal(unknown.cleanup.state, 'NOT_CREATED');
  for (let round = 1; round <= 2; round++) {
    const start = Date.now();
    const result = await inspector.inspect('acme-login');
    const png = result.pngBase64 ? Buffer.from(result.pngBase64, 'base64') : null;
    const record = {
      round,
      durationMs: Date.now() - start,
      ...result,
      pngBase64: undefined,
      pngBytes: png?.length ?? 0,
      pngSha256: png ? createHash('sha256').update(png).digest('hex') : null,
    };
    runs.push(record);
    if (png) await writeFile(`${output}.round-${round}.png`, png, { mode: 0o600, flag: 'wx' });
    process.stdout.write(
      `${JSON.stringify({ round, execution: result.execution, failure: result.failure, cleanup: result.cleanup.state, sandboxId: result.sandboxId, pngBytes: record.pngBytes })}\n`,
    );
    assert.equal(result.execution, 'SUCCEEDED');
    assert.equal(result.cleanup.state, 'CONFIRMED');
    assert.equal(result.observation?.finalUrl, config.fixture.url);
    assert.equal(result.observation?.claimedService, 'ACME');
    assert.equal(result.observation?.passwordField, true);
    assert.equal(result.observation?.formDestinationOrigin, 'https://outside-idp.invalid');
    assert.equal(inspector.outstandingCleanups().length, 0);
  }
  assert.notEqual(runs[0]?.sandboxId, runs[1]?.sandboxId);
} catch (error) {
  failure = error instanceof Error ? error.message : 'Live verification failed';
  process.exitCode = 1;
} finally {
  let after: Awaited<ReturnType<typeof inventory>> | null = null;
  try {
    after = await inventory();
  } catch {
    failure = 'Independent final provider inventory unavailable';
    process.exitCode = 1;
  }
  if (after?.length) {
    failure = 'Provider inventory is not empty after verification';
    process.exitCode = 1;
  }
  await writeFile(
    output,
    `${JSON.stringify({ schemaVersion: 1, verifiedAt: new Date().toISOString(), scope: 'Two sequential owned-fixture browser inspections; no Safari or Astra claim', status: failure ? 'FAILED' : 'PASSED', failure, snapshot: { id: snapshot.snapshotId, expiresAt: snapshot.expiresAt, sourceSessionId: snapshot.sourceSessionId }, before, runs, after, outstandingCleanups: inspector.outstandingCleanups() }, null, 2)}\n`,
    { mode: 0o600, flag: 'w' },
  );
  process.stdout.write(
    `${JSON.stringify({ status: failure ? 'FAILED' : 'PASSED', failure, remainingResources: after?.length ?? null, receipt: output })}\n`,
  );
}
