import { Readable } from 'node:stream';
import { Sandbox } from '@vercel/sandbox';
import { afterEach, expect, it, vi } from 'vitest';
import { sdkCredentials, vercelProvider } from '../../src/server/isolation/provider.ts';

afterEach(() => vi.restoreAllMocks());
it('uses the real SDK port without automatic persistence, shared profiles or guest credentials', async () => {
  const create = vi.spyOn(Sandbox, 'create').mockResolvedValue({
    currentSession: () => ({ sessionId: 'sbox_fixture' }),
    writeFiles: vi.fn(),
    runCommand: vi.fn().mockResolvedValue({ exitCode: 0 }),
    readFile: vi.fn().mockResolvedValue(Readable.from([Buffer.alloc(20)])),
    stop: vi.fn().mockResolvedValue({ status: 'stopped' }),
    delete: vi.fn(),
  } as unknown as Awaited<ReturnType<typeof Sandbox.create>>);
  const signal = AbortSignal.timeout(1000);
  const vm = await vercelProvider.create(
    {
      name: 'fresh',
      snapshotId: 'snap_clean',
      region: 'iad1',
      timeoutMs: 90_000,
      networkPolicy: { allow: ['fixture.example'] },
      credentials: { token: 'test-only', projectId: 'prj_test', teamId: 'team_test' },
    },
    signal,
  );
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      persistent: false,
      env: {},
      ports: [],
      source: { type: 'snapshot', snapshotId: 'snap_clean' },
      networkPolicy: { allow: ['fixture.example'] },
      resources: { vcpus: 2 },
    }),
  );
  await expect(vm.readResult(10, signal)).rejects.toMatchObject({ code: 'INVALID_EVIDENCE' });
});
it('rejects invalid or expired OIDC configuration locally', () => {
  expect(() => sdkCredentials({ oidcToken: 'invalid' })).toThrow('PROVIDER_UNAVAILABLE');
  const expired = `header.${Buffer.from(JSON.stringify({ exp: 1, owner_id: 'team', project_id: 'prj' })).toString('base64url')}.signature`;
  expect(() => sdkCredentials({ oidcToken: expired })).toThrow('PROVIDER_UNAVAILABLE');
});

it('does not start Chromium unless guest IPv6 disablement succeeds', async () => {
  const runCommand = vi.fn().mockResolvedValue({ exitCode: 1 });
  vi.spyOn(Sandbox, 'create').mockResolvedValue({
    currentSession: () => ({ sessionId: 'sbox_fixture' }),
    runCommand,
  } as unknown as Awaited<ReturnType<typeof Sandbox.create>>);
  const vm = await vercelProvider.create(
    {
      name: 'fresh-ipv6-test',
      snapshotId: 'snap_clean',
      region: 'iad1',
      timeoutMs: 90_000,
      networkPolicy: { allow: ['fixture.example'] },
      credentials: { token: 'test-only', projectId: 'prj_test', teamId: 'team_test' },
    },
    AbortSignal.timeout(1000),
  );
  await expect(vm.runWorker(30_000, AbortSignal.timeout(1000))).rejects.toMatchObject({
    code: 'PROVIDER_UNAVAILABLE',
  });
  expect(runCommand).toHaveBeenCalledTimes(1);
  expect(runCommand).toHaveBeenCalledWith(
    expect.objectContaining({
      cmd: 'sysctl',
      sudo: true,
      args: ['-w', 'net.ipv6.conf.all.disable_ipv6=1', 'net.ipv6.conf.default.disable_ipv6=1'],
    }),
  );
});
