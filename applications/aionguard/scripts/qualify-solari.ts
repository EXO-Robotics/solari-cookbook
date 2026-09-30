import { readConfig } from '../src/server/runtime/config.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SolariInspector, solariConfigFromEnv } from '../src/server/isolation/solari.ts';
import { detectThreats } from '../src/server/detection/index.ts';

if (!process.argv.includes('--live'))
  throw new Error(
    'Pass --live to create one billed Solari sandbox for the configured owned fixture.',
  );
readConfig();
const config = solariConfigFromEnv(process.env);
if (!config) throw new Error('Valid Solari and owned fixture configuration required.');
const output = `runtime-data/solari-${new Date().toISOString().replaceAll(':', '-')}`;
await mkdir(output, { recursive: true, mode: 0o700 });
const inspector = new SolariInspector(config);
const start = Date.now();
console.log(
  'Starting one owned-fixture Solari inspection. Cold browser setup may take several minutes.',
);
const result = await inspector.inspect('acme-login');
const { pngBase64, ...inspection } = result;
const findings = result.observation
  ? detectThreats(result.observation, config.fixture.identityProviderOrigins)
  : [];
const report = {
  inspection,
  findings,
  elapsedMs: Date.now() - start,
  endpointInterceptionVerified: false,
  productionScaleVerified: false,
  workerSha256: createHash('sha256')
    .update(
      await (
        await import('node:fs/promises')
      ).readFile(new URL('../src/server/isolation/worker.mjs', import.meta.url)),
    )
    .digest('hex'),
};
await writeFile(`${output}/receipt.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
if (pngBase64)
  await writeFile(`${output}/inspection.png`, Buffer.from(pngBase64, 'base64'), { mode: 0o600 });
console.log(
  JSON.stringify({
    output,
    execution: result.execution,
    failure: result.failure,
    cleanup: result.cleanup.state,
    categories: findings.map((f) => f.category),
    elapsedMs: report.elapsedMs,
  }),
);
if (result.execution !== 'SUCCEEDED' || result.cleanup.state !== 'CONFIRMED') process.exitCode = 1;
