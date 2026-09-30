import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readConfig } from '../src/server/runtime/config.js';

/** Preserve the first failure even when the other child subsequently exits cleanly. */
export function superviseLauncher(
  controller: Pick<ChildProcess, 'kill' | 'on'>,
  setExitCode: (code: number) => void = (code) => {
    process.exitCode = code;
  },
) {
  let recovery: Pick<ChildProcess, 'kill' | 'on'> | undefined;
  let stopping = false;
  let failureCode: number | null = null;
  const fail = (code = 1) => {
    failureCode ??= Number.isInteger(code) && code > 0 ? code : 1;
    setExitCode(failureCode);
  };
  const stop = () => {
    if (stopping) return;
    stopping = true;
    recovery?.kill('SIGTERM');
    controller.kill('SIGTERM');
  };
  controller.on('exit', (code) => {
    if (!stopping && code !== 0) fail(code ?? 1);
    stop();
    setExitCode(failureCode ?? 0);
  });
  controller.on('error', () => {
    fail();
    stop();
  });
  return {
    stop,
    fail,
    isStopping: () => stopping,
    attachRecovery(child: Pick<ChildProcess, 'kill' | 'on'>) {
      recovery = child;
      child.on('error', () => {
        fail();
        stop();
      });
      child.on('exit', (code) => {
        // Even a zero exit is unexpected unless shutdown was already requested.
        if (!stopping) fail(code ?? 1);
        stop();
      });
      if (stopping) child.kill('SIGTERM');
    },
  };
}

async function main() {
  // This launcher starts recovery and the controller, never a protection lease.
  const config = readConfig();
  const helper = resolve(
    process.env.AIONGUARD_RECOVERY_EXECUTABLE ??
      'runtime-data/safari-build/Build/Products/Debug/AionGuard.app/Contents/MacOS/AionGuard',
  );
  if (!existsSync(helper))
    throw new Error(
      'Build the signed Safari recovery app first; see src/extension/recovery/README.md',
    );
  if (!existsSync('dist/index.html'))
    throw new Error('Run npm run build before starting the integrated application');
  const port = config.AIONGUARD_PORT;
  try {
    await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(500) });
    throw new Error(
      'A controller already uses this port. Stop it explicitly before using the integrated launcher.',
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('A controller')) throw error;
  }
  const env = {
    ...process.env,
    PATH: `${process.execPath.slice(0, process.execPath.lastIndexOf('/'))}:${process.env.PATH ?? ''}`,
  };
  const controller = spawn(process.execPath, ['--import', 'tsx', 'src/server/main.ts'], {
    env,
    stdio: 'inherit',
  });
  const lifecycle = superviseLauncher(controller);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, lifecycle.stop);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50 && !lifecycle.isStopping(); attempt++) {
      try {
        const token = (await readFile('runtime-data/recovery-token', 'utf8')).trim();
        const response = await fetch(`http://127.0.0.1:${port}/api/protection`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(500),
        });
        if (response.ok && (await response.json()).armed === false) {
          ready = true;
          break;
        }
      } catch {
        /* Wait for the newly spawned controller. */
      }
      await new Promise((done) => setTimeout(done, 100));
    }
    if (!ready || lifecycle.isStopping()) throw new Error('Controller did not start unarmed');
    lifecycle.attachRecovery(
      spawn(
        helper,
        ['--token-file', resolve('runtime-data/recovery-token'), '--port', String(port)],
        { env, stdio: 'inherit' },
      ),
    );
    console.info(
      'Controller and passive recovery started. Protection remains off until an explicit operator arm.',
    );
  } catch {
    lifecycle.fail();
    lifecycle.stop();
    console.error('Integrated startup failed; protection was not armed.');
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await main();
