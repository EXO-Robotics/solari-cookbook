import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sandbox } from '@vercel/sandbox';
import { afterEach, expect, it, vi } from 'vitest';
import { prepareCleanImage } from '../../src/server/isolation/prepare-image.ts';

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function output() {
  const directory = await mkdtemp(join(tmpdir(), 'aionguard-image-test-'));
  directories.push(directory);
  return join(directory, 'candidate.json');
}
function authorize() {
  vi.stubEnv('AIONGUARD_IMAGE_BUILD_CONFIRM', 'CREATE_CLEAN_IMAGE');
  vi.stubEnv('VERCEL_TOKEN', '');
  vi.stubEnv('VERCEL_TEAM_ID', '');
  vi.stubEnv('VERCEL_PROJECT_ID', '');
  vi.stubEnv(
    'VERCEL_OIDC_TOKEN',
    `header.${Buffer.from(JSON.stringify({ owner_id: 'team_test', project_id: 'prj_test', exp: Date.now() / 1000 + 3600 })).toString('base64url')}.signature`,
  );
}
it('requires explicit build activation and preserves an existing candidate before provider creation', async () => {
  const create = vi.spyOn(Sandbox, 'create');
  vi.stubEnv('AIONGUARD_IMAGE_BUILD_CONFIRM', '');
  const path = await output();
  await expect(prepareCleanImage(path)).rejects.toThrow('explicitly enabled');
  authorize();
  await writeFile(path, 'existing approval');
  await expect(prepareCleanImage(path)).rejects.toMatchObject({ code: 'EEXIST' });
  expect(await readFile(path, 'utf8')).toBe('existing approval');
  expect(create).not.toHaveBeenCalled();
});
it('builds with explicit OIDC, smoke-checks Chromium, closes egress, and cleans up without auto-approval', async () => {
  authorize();
  const events: string[] = [];
  const runCommand = vi.fn(async (command: { cmd: string }) => {
    events.push(command.cmd);
    return { exitCode: 0 };
  });
  const create = vi.spyOn(Sandbox, 'create').mockResolvedValue({
    status: 'running',
    runCommand,
    update: vi.fn(async () => {
      events.push('deny-all');
    }),
    snapshot: vi.fn(async () => {
      events.push('snapshot');
      return { snapshotId: 'snap_test' };
    }),
    stop: vi.fn(async () => {
      events.push('stop');
      return { status: 'stopped' };
    }),
    delete: vi.fn(async () => {
      events.push('delete');
    }),
  } as unknown as Awaited<ReturnType<typeof Sandbox.create>>);
  const path = await output();
  await prepareCleanImage(path);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: 'prj_test',
      teamId: 'team_test',
      persistent: false,
      env: {},
      ports: [],
      timeout: 300_000,
    }),
  );
  expect(events).toEqual(['dnf', 'npm', 'node', 'node', 'deny-all', 'snapshot', 'stop', 'delete']);
  expect(runCommand.mock.calls[3]?.[0]).toMatchObject({
    args: expect.arrayContaining([expect.stringContaining("page.goto('about:blank')")]),
  });
  expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
    approvedAt: null,
    snapshotId: 'snap_test',
    credentialsIncluded: false,
    buildProvenance: {
      blankBrowserVerified: true,
      recipeSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    },
  });
});
it('stops and deletes a failed dependency build without creating an approval record', async () => {
  authorize();
  const stop = vi.fn(async () => ({ status: 'stopped' })),
    remove = vi.fn();
  vi.spyOn(Sandbox, 'create').mockResolvedValue({
    status: 'running',
    runCommand: vi.fn(async () => ({ exitCode: 1 })),
    stop,
    delete: remove,
  } as unknown as Awaited<ReturnType<typeof Sandbox.create>>);
  const path = await output();
  await expect(prepareCleanImage(path)).rejects.toThrow('dependency build failed');
  expect(stop).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledOnce();
  expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ state: 'BUILDING' });
  expect(JSON.parse(await readFile(path, 'utf8'))).not.toHaveProperty('snapshotId');
});
