import { mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IsolationError, type InspectionVm } from '../src/server/isolation/provider.ts';
import { solariConfigFromEnv, type SolariProvider } from '../src/server/isolation/solari.ts';
import { journaledSolariProvider } from '../src/server/isolation/warm-journal.ts';

const dirs: string[] = [];
const signal = new AbortController().signal;
const config = solariConfigFromEnv({
  SOLARI_API_KEY: 'secret-controller-only',
  AIONGUARD_FIXTURE_URL: 'https://fixture.example/login.html',
  AIONGUARD_IDP_ORIGINS: 'https://id.example',
})!;
const options = { name: 'aionguard-owned-unique', config };

async function fixture(overrides: Partial<InspectionVm> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'warm-journal-'));
  dirs.push(dir);
  const path = join(dir, 'private', 'session.json');
  const vm: InspectionVm = {
    id: 'raw.signed.secret-capability',
    writeFiles: vi.fn(async () => {}),
    runWorker: vi.fn(async () => 0),
    readResult: vi.fn(async () => Buffer.from('evidence')),
    stop: vi.fn(async () => ({ status: 'stopped' })),
    delete: vi.fn(async () => {}),
    ...overrides,
  };
  const create = vi.fn(async () => vm);
  return { path, vm, create, provider: journaledSolariProvider(path, { create }) };
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('durable warm sandbox ownership', () => {
  it('persists private ownership before provider creation without secret capabilities', async () => {
    const f = await fixture();
    f.create.mockImplementation(async () => {
      const text = await readFile(f.path, 'utf8');
      expect(JSON.parse(text)).toMatchObject({ schemaVersion: 1, name: options.name });
      expect(text).not.toContain(config.apiKey);
      expect(text).not.toContain(f.vm.id);
      expect((await stat(f.path)).mode & 0o777).toBe(0o600);
      expect((await stat(join(f.path, '..'))).mode & 0o777).toBe(0o700);
      return f.vm;
    });
    await f.provider.create(options, signal);
    expect(f.create).toHaveBeenCalledOnce();
  });

  it('blocks a second provider instance before boot when a reservation exists', async () => {
    const f = await fixture();
    await f.provider.create(options, signal);
    const original = await readFile(f.path, 'utf8');
    const create = vi.fn();
    await expect(
      journaledSolariProvider(f.path, { create }).create(options, signal),
    ).rejects.toMatchObject({ code: 'CAPACITY', creationRejected: false });
    expect(create).not.toHaveBeenCalled();
    expect(await readFile(f.path, 'utf8')).toBe(original);
  });

  it.each([true, false])('clears only a definite rejected creation: %s', async (rejected) => {
    const f = await fixture();
    const failure = new IsolationError('PROVIDER_UNAVAILABLE', rejected);
    const base: SolariProvider = {
      create: async () => {
        throw failure;
      },
    };
    await expect(journaledSolariProvider(f.path, base).create(options, signal)).rejects.toBe(
      failure,
    );
    if (rejected) await expect(stat(f.path)).rejects.toMatchObject({ code: 'ENOENT' });
    else expect(JSON.parse(await readFile(f.path, 'utf8')).name).toBe(options.name);
  });

  it.each(['stopped', 'aborted', 'running'])(
    'requires terminal stop and successful delete: %s',
    async (status) => {
      const f = await fixture({ stop: async () => ({ status }) });
      const vm = await f.provider.create(options, signal);
      await vm.stop(signal);
      await vm.delete(signal);
      if (status === 'running') expect(await readFile(f.path, 'utf8')).toContain(options.name);
      else await expect(stat(f.path)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('preserves reservation on failed deletion and deletion without prior stop', async () => {
    const f = await fixture();
    const vm = await f.provider.create(options, signal);
    await vm.delete(signal);
    expect(await readFile(f.path, 'utf8')).toContain(options.name);
    await vm.stop(signal);
    f.vm.delete = async () => {
      throw new Error('unconfirmed');
    };
    await expect(vm.delete(signal)).rejects.toThrow('unconfirmed');
    expect(await readFile(f.path, 'utf8')).toContain(options.name);
  });

  it('does not allow stale cleanup callbacks to remove a replacement owner', async () => {
    const f = await fixture();
    const vm = await f.provider.create(options, signal);
    await vm.stop(signal);
    await vm.delete(signal);
    await f.provider.create({ ...options, name: 'aionguard-replacement' }, signal);
    const replacement = await readFile(f.path, 'utf8');
    await vm.delete(signal);
    expect(await readFile(f.path, 'utf8')).toBe(replacement);
    await unlink(f.path);
    await writeFile(f.path, '{invalid replacement');
    await vm.delete(signal);
    expect(await readFile(f.path, 'utf8')).toBe('{invalid replacement');
  });

  it('forwards method arguments and receiver to the real VM', async () => {
    const f = await fixture({
      runWorker: async function () {
        expect(this.id).toBe('raw.signed.secret-capability');
        return 7;
      },
    });
    const vm = await f.provider.create(options, signal);
    const files = [{ path: '/request', content: 'owned fixture' }];
    await vm.writeFiles(files, signal);
    expect(f.vm.writeFiles).toHaveBeenCalledWith(files, signal);
    expect(await vm.runWorker(123, signal)).toBe(7);
    expect(await vm.readResult(99, signal)).toEqual(Buffer.from('evidence'));
    expect(f.vm.readResult).toHaveBeenCalledWith(99, signal);
  });
});
