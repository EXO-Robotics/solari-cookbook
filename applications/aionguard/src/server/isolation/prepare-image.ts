import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sandbox } from '@vercel/sandbox';
import { BROWSER_VERSION } from './policy.ts';
import { sdkCredentials } from './provider.ts';

const CHROMIUM_LIBRARIES = [
  'nss',
  'nspr',
  'libxkbcommon',
  'atk',
  'at-spi2-atk',
  'at-spi2-core',
  'libXcomposite',
  'libXdamage',
  'libXrandr',
  'libXfixes',
  'libXcursor',
  'libXi',
  'libXtst',
  'libXScrnSaver',
  'libXext',
  'mesa-libgbm',
  'libdrm',
  'mesa-libGL',
  'mesa-libEGL',
  'cups-libs',
  'alsa-lib',
  'pango',
  'cairo',
  'gtk3',
  'dbus-libs',
];

/** Explicit administrative build command. Importing this module never creates infrastructure. */
export async function prepareCleanImage(output: string): Promise<void> {
  if (process.env.AIONGUARD_IMAGE_BUILD_CONFIRM !== 'CREATE_CLEAN_IMAGE')
    throw new Error('Clean-image creation must be explicitly enabled');
  const token = process.env.VERCEL_TOKEN,
    teamId = process.env.VERCEL_TEAM_ID,
    projectId = process.env.VERCEL_PROJECT_ID;
  const credentials =
    token && teamId && projectId
      ? { token, teamId, projectId }
      : process.env.VERCEL_OIDC_TOKEN
        ? sdkCredentials({ oidcToken: process.env.VERCEL_OIDC_TOKEN })
        : null;
  if (!credentials)
    throw new Error('Explicit Vercel credentials or official pulled OIDC are required');
  const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{40}$/.test(sourceRevision)) throw new Error('Source revision is required');
  // Bind the actual administrative recipe, including an uncommitted integration fix.
  // Unrelated local artifacts never enter the VM and need not prevent a clean image build.
  const recipeSha256 = createHash('sha256')
    .update(await readFile(new URL('./prepare-image.ts', import.meta.url)))
    .update(await readFile(new URL('./policy.ts', import.meta.url)))
    .digest('hex');
  const sourceTreeDirty = Boolean(
    execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      encoding: 'utf8',
    }).trim(),
  );
  // Reserve the private output before spending provider usage. A failed build
  // leaves an explicitly unapproved journal rather than overwriting an old image.
  await writeFile(
    resolve(output),
    `${JSON.stringify({ state: 'BUILDING', sourceRevision, recipeSha256 })}\n`,
    { mode: 0o600, flag: 'wx' },
  );
  const sandbox = await Sandbox.create({
    ...credentials,
    name: `aionguard-image-${randomUUID()}`,
    runtime: 'node24',
    persistent: false,
    region: 'iad1',
    resources: { vcpus: 2 },
    timeout: 300_000,
    networkPolicy: 'allow-all',
    env: {},
    ports: [],
    signal: AbortSignal.timeout(30_000),
  });
  try {
    const commands = [
      { cmd: 'dnf', args: ['install', '-y', ...CHROMIUM_LIBRARIES], sudo: true },
      {
        cmd: 'npm',
        args: ['install', '--save-exact', '--ignore-scripts', `playwright@${BROWSER_VERSION}`],
        sudo: false,
      },
      { cmd: 'node', args: ['node_modules/playwright/cli.js', 'install', 'chromium'], sudo: false },
      {
        cmd: 'node',
        args: [
          '--input-type=module',
          '-e',
          "import { chromium } from 'playwright'; const browser = await chromium.launch({headless:true}); try { const context = await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false}); const page = await context.newPage(); await page.goto('about:blank'); const png = await page.screenshot(); if (png.length < 45 || (await context.cookies()).length) throw new Error('Invalid blank browser'); await context.close(); } finally { await browser.close(); }",
        ],
        sudo: false,
      },
    ];
    for (const command of commands) {
      const result = await sandbox.runCommand({
        ...command,
        cwd: '/vercel/sandbox',
        env: { PLAYWRIGHT_BROWSERS_PATH: '/vercel/sandbox/ms-playwright' },
        timeoutMs: 90_000,
        signal: AbortSignal.timeout(95_000),
      });
      if (result.exitCode !== 0) throw new Error('Clean-image dependency build failed');
    }
    await sandbox.update({ networkPolicy: 'deny-all' }, { signal: AbortSignal.timeout(15_000) });
    const snapshot = await sandbox.snapshot({
      expiration: 86_400_000,
      signal: AbortSignal.timeout(30_000),
    });
    await writeFile(
      resolve(output),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          snapshotId: snapshot.snapshotId,
          sourceRevision,
          buildProvenance: { recipeSha256, sourceTreeDirty, blankBrowserVerified: true },
          approvedAt: null,
          playwrightVersion: BROWSER_VERSION,
          clean: true,
          visitedContent: false,
          credentialsIncluded: false,
        },
        null,
        2,
      )}\n`,
      { mode: 0o600, flag: 'w' },
    );
    // approvedAt stays null: the operator must review this candidate before the LIVE loader accepts it.
  } finally {
    let stopped = ['stopped', 'aborted'].includes(sandbox.status);
    try {
      if (!stopped) {
        const state = await sandbox.stop({ signal: AbortSignal.timeout(30_000) });
        stopped = ['stopped', 'aborted'].includes(state.status);
      }
    } finally {
      await sandbox.delete({ signal: AbortSignal.timeout(30_000) });
    }
    if (!stopped)
      throw new Error('Image-build cleanup requires independent terminal-state confirmation');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const output = process.argv[2];
  if (!output) {
    process.stderr.write(
      'Usage: tsx src/server/isolation/prepare-image.ts <private-candidate-record.json>\n',
    );
    process.exitCode = 1;
  } else
    prepareCleanImage(output).catch(() => {
      process.stderr.write(
        'Clean-image build failed. Check configuration and provider cleanup before retrying.\n',
      );
      process.exitCode = 1;
    });
}
