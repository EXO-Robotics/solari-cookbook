import { randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
} from 'node:fs';
import { mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { IsolationError, type InspectionVm } from './provider.ts';
import { solariProvider, type SolariProvider } from './solari.ts';

/** Persist ownership before boot. An existing reservation requires explicit reconciliation. */
export function journaledSolariProvider(
  path: string,
  base: SolariProvider = solariProvider,
): SolariProvider {
  return {
    async create(options, signal) {
      const ownerId = randomUUID();
      try {
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        const file = await open(path, 'wx', 0o600);
        try {
          // Keep the correlation name, never credentials or the signed provider capability.
          await file.writeFile(
            JSON.stringify({
              schemaVersion: 1,
              ownerId,
              name: options.name,
              createdAt: new Date().toISOString(),
            }),
          );
          await file.sync();
        } finally {
          await file.close();
        }
        const directory = await open(dirname(path), 'r');
        try {
          await directory.sync();
        } finally {
          await directory.close();
        }
      } catch (error) {
        throw new IsolationError(
          (error as NodeJS.ErrnoException).code === 'EEXIST' ? 'CAPACITY' : 'PROVIDER_UNAVAILABLE',
          false,
        );
      }

      function removeOwnedReservation(): void {
        let fd: number | undefined;
        try {
          // No await between identity verification and unlink: stale callbacks in this
          // process cannot interleave a new reservation. Refuse symlinks and replacements.
          fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
          const opened = fstatSync(fd);
          const record: unknown = JSON.parse(readFileSync(fd, 'utf8'));
          const current = lstatSync(path);
          if (
            typeof record !== 'object' ||
            record === null ||
            !('ownerId' in record) ||
            record.ownerId !== ownerId ||
            current.dev !== opened.dev ||
            current.ino !== opened.ino
          )
            return;
          unlinkSync(path);
        } catch {
          // Missing, corrupt, replaced, or inaccessible journal stays fail-closed.
        } finally {
          if (fd !== undefined) closeSync(fd);
        }
      }

      let vm: InspectionVm;
      try {
        vm = await base.create(options, signal);
      } catch (error) {
        if (error instanceof IsolationError && error.creationRejected) removeOwnedReservation();
        throw error;
      }
      let stopped = false;
      return {
        id: vm.id,
        writeFiles: (files, operationSignal) => vm.writeFiles(files, operationSignal),
        runWorker: (timeoutMs, operationSignal) => vm.runWorker(timeoutMs, operationSignal),
        readResult: (maxBytes, operationSignal) => vm.readResult(maxBytes, operationSignal),
        async stop(operationSignal) {
          stopped = false;
          const result = await vm.stop(operationSignal);
          stopped = result.status === 'stopped' || result.status === 'aborted';
          return result;
        },
        async delete(operationSignal) {
          const terminalBeforeDelete = stopped;
          await vm.delete(operationSignal);
          if (terminalBeforeDelete && stopped) removeOwnedReservation();
        },
      };
    },
  };
}
