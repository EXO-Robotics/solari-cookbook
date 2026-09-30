import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CaseController } from './runtime/controller.js';
import { ProtectionLease } from './runtime/protection.js';
import { readConfig } from './runtime/config.js';
import { createHttpServer } from './http/server.js';
import { CliAstraPlanner, MockPlanner } from './planner/index.js';
import { VercelInspector, createMockInspector, inspectorConfigFromEnv } from './isolation/index.js';

import { SolariInspector, solariConfigFromEnv } from './isolation/solari.js';
import { WarmSolariInspector } from './isolation/warm-solari.js';
import { journaledSolariProvider } from './isolation/warm-journal.js';

const config = readConfig();
await mkdir('runtime-data', { recursive: true, mode: 0o700 });
async function localToken(name: string, supplied?: string): Promise<string> {
  if (supplied) return supplied;
  const path = resolve('runtime-data', name);
  try {
    const existing = (await readFile(path, 'utf8')).trim();
    if (existing.length >= 32) return existing;
  } catch {
    /* A new local installation gets a private random token. */
  }
  const value = randomBytes(32).toString('base64url');
  await writeFile(path, value + '\n', { mode: 0o600 });
  return value;
}
const token = await localToken('controller-token', config.AIONGUARD_CONTROLLER_TOKEN);
const entryToken = await localToken('entry-token', config.AIONGUARD_ENTRY_TOKEN);
const recoveryToken = await localToken('recovery-token');
let approval: unknown = null;
try {
  approval = JSON.parse(
    await readFile(
      process.env.AIONGUARD_SNAPSHOT_APPROVAL_PATH ?? 'runtime-data/snapshot-approval.json',
      'utf8',
    ),
  );
} catch {
  /* Missing approval intentionally disables live inspection. */
}
const inspectorConfig =
  config.AIONGUARD_PROVIDER === 'SOLARI'
    ? solariConfigFromEnv(process.env)
    : inspectorConfigFromEnv(process.env, approval);
const inspectionSource =
  config.AIONGUARD_PROVIDER === 'SOLARI' ? 'SOLARI_SANDBOX' : 'VERCEL_SANDBOX';
const warmInspector =
  config.AIONGUARD_MODE === 'LIVE' &&
  config.AIONGUARD_PROVIDER === 'SOLARI' &&
  config.AIONGUARD_WORKFLOW === 'DETECTOR' &&
  config.AIONGUARD_SOLARI_SESSION === 'WARM'
    ? new WarmSolariInspector(
        solariConfigFromEnv(process.env),
        journaledSolariProvider(resolve('runtime-data', 'solari-warm-owner.json')),
        {
          idleTimeoutMs: config.AIONGUARD_SOLARI_IDLE_MS,
          maxAgeMs: config.AIONGUARD_SOLARI_MAX_AGE_MS,
          maxInspections: config.AIONGUARD_SOLARI_MAX_INSPECTIONS,
        },
      )
    : undefined;
const inspector =
  config.AIONGUARD_MODE === 'MOCK'
    ? createMockInspector(inspectionSource)
    : config.AIONGUARD_PROVIDER === 'SOLARI'
      ? (warmInspector ?? new SolariInspector(solariConfigFromEnv(process.env)))
      : new VercelInspector(inspectorConfigFromEnv(process.env, approval));
const planner =
  config.AIONGUARD_MODE === 'MOCK' || config.AIONGUARD_WORKFLOW === 'DETECTOR'
    ? new MockPlanner()
    : new CliAstraPlanner({
        executable: config.ASTRA_CLI_PATH,
        model: config.OPENAI_MODEL,
        timeoutMs: config.ASTRA_TIMEOUT_MS,
        onTrace: (trace) => {
          console.info(JSON.stringify({ type: 'planner_trace', ...trace }));
        },
      });
let comparisonReport: unknown = null;
try {
  comparisonReport = JSON.parse(
    await readFile(
      process.env.AIONGUARD_COMPARISON_PATH ?? 'runtime-data/comparison-latest.json',
      'utf8',
    ),
  );
} catch {
  /* No precomputed report is assumed. */
}
const controller = new CaseController({
  comparisonReport,
  releasePolicy: inspectorConfig ? { url: inspectorConfig.fixture.url } : undefined,
  workflow: config.AIONGUARD_WORKFLOW,
  inspectionSource,
  inspector,
  planner,
  inspectionMode: config.AIONGUARD_MODE,
  plannerMode: config.AIONGUARD_WORKFLOW === 'DETECTOR' ? 'MOCK' : config.AIONGUARD_MODE,
  approvedIdpOrigins: inspectorConfig?.fixture.identityProviderOrigins.slice() ?? [
    'https://idp.acme.invalid',
  ],
});
const protection = new ProtectionLease(() => controller.revokeEntry());
const protectionWatchdog = setInterval(() => protection.status(), 500);
protectionWatchdog.unref();
const server = createHttpServer({
  controller,
  token,
  entryToken,
  recoveryToken,
  protection,
  sandbox: warmInspector,
  controlledClickDemo:
    config.AIONGUARD_CONTROLLED_CLICK_DEMO === 'true' &&
    config.AIONGUARD_MODE === 'LIVE' &&
    config.AIONGUARD_PROVIDER === 'SOLARI' &&
    config.AIONGUARD_WORKFLOW === 'DETECTOR',
  port: config.AIONGUARD_PORT,
  mode: config.AIONGUARD_MODE,
  workflow: config.AIONGUARD_WORKFLOW,
  staticDir: resolve('dist'),
  allowedExtensionOrigins: (process.env.AIONGUARD_EXTENSION_ORIGINS ?? '')
    .split(',')
    .filter(Boolean),
});
server.requestTimeout = 360_000;
server.headersTimeout = 10_000;
server.listen(config.AIONGUARD_PORT, '127.0.0.1', () => {
  // Begin bounded preparation before a click; callers can observe PREPARING/READY.
  void warmInspector?.prepare().catch(() => {
    console.error('Warm sandbox preparation failed; inspect authenticated sandbox status.');
  });
  console.info(
    `AionGuard ${config.AIONGUARD_MODE} controller: http://127.0.0.1:${config.AIONGUARD_PORT}`,
  );
  console.info(
    'Private local access tokens are in runtime-data/ unless configured by environment. They are never served by the UI.',
  );
  if (config.AIONGUARD_MODE === 'LIVE' && !inspectorConfig)
    console.info(
      'Live inspection unavailable: registered fixture and provider configuration are required.',
    );
});
server.on('error', () => {
  console.error('Controller could not listen on the configured loopback port.');
  process.exitCode = 1;
  void warmInspector?.close().catch(() => {
    console.error('Warm sandbox shutdown failed; reconcile the ownership journal before reuse.');
  });
});
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    protection.shutdown();
    clearInterval(protectionWatchdog);
    console.info(
      'Controller shutting down. Preserve receipts and reconcile any unresolved provider cleanup before a new LIVE session.',
    );
    const drained = new Promise<void>((done) => server.close(() => done()));
    // close() fences new prepares immediately, then waits for accepted work and cleanup.
    void Promise.all([drained, warmInspector?.close()])
      .then(() => {
        const unresolved = warmInspector?.status().cleanupUnresolved ?? 0;
        if (unresolved) {
          console.error(
            `Warm sandbox cleanup unresolved (${unresolved}); preserve and reconcile runtime-data/solari-warm-owner.json.`,
          );
          process.exitCode = 1;
        } else process.exitCode = 0;
      })
      .catch(() => {
        console.error(
          'Warm sandbox shutdown incomplete; preserve and reconcile runtime-data/solari-warm-owner.json.',
        );
        process.exitCode = 1;
      });
    server.closeIdleConnections();
  });
