import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  CleanupSchema,
  IdSchema,
  InspectionObservationSchema,
  InspectionResultSchema,
  type Cleanup,
  type InspectionResult,
  type Inspector,
} from '../../contracts/index.ts';
import { validateConfig, type VercelInspectorConfig } from './config.ts';
import { FIXTURE_ID, isAllowedNavigation, MAX_RESULT_BYTES, validPng } from './policy.ts';
import { pathAllowed } from './worker.mjs';
import {
  IsolationError,
  vercelProvider,
  type InspectionVm,
  type IsolationProvider,
} from './provider.ts';

const PayloadSchema = z
  .object({
    observation: InspectionObservationSchema,
    pngBase64: z
      .string()
      .min(1)
      .max(3_400_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
const WorkerFailureSchema = z
  .object({ failure: z.enum(['NAVIGATION_DENIED', 'TIMEOUT', 'INVALID_EVIDENCE']) })
  .strict();
type Pending = { vm: InspectionVm | null; cleanup: Cleanup };

export class VercelInspector implements Inspector {
  private readonly config: Required<VercelInspectorConfig> | null;
  private readonly pending = new Map<string, Pending>();

  constructor(
    config: VercelInspectorConfig | null,
    private readonly provider: IsolationProvider = vercelProvider,
  ) {
    this.config = config === null ? null : validateConfig(config);
  }

  /** Unresolved cleanup counts against admission until independently resolved. */
  outstandingCleanups(): Cleanup[] {
    return [...this.pending.values()].map((item) => CleanupSchema.parse(item.cleanup));
  }

  async inspect(fixtureId: string): Promise<InspectionResult> {
    const empty: InspectionResult = {
      execution: 'UNAVAILABLE',
      mode: 'LIVE',
      observation: null,
      pngBase64: null,
      source: 'VERCEL_SANDBOX',
      sandboxId: null,
      createdAt: null,
      collectionStartedAt: null,
      returnedAt: new Date().toISOString(),
      cleanup: { state: 'NOT_CREATED', sandboxId: null, stoppedAt: null, deletedAt: null },
      failure: 'NOT_CONFIGURED',
    };
    if (fixtureId !== FIXTURE_ID)
      return InspectionResultSchema.parse({ ...empty, failure: 'NAVIGATION_DENIED' });
    if (!this.config) return empty;
    if (this.pending.size >= this.config.maxConcurrent) return { ...empty, failure: 'CAPACITY' };
    // Permit support assets only within the registered URL's containing directory.
    // A legacy root fixture keeps its original origin-wide request scope.
    const requestPath = new URL(this.config.fixture.url).pathname.replace(/[^/]*$/, '');
    const name = `aionguard-${randomUUID()}`;
    const pending: Pending = {
      vm: null,
      cleanup: { state: 'PENDING', sandboxId: name, stoppedAt: null, deletedAt: null },
    };
    this.pending.set(name, pending);
    const result = { ...empty, cleanup: pending.cleanup };
    let creationAttempted = false;
    try {
      // Upload only this event-built worker and registered destination configuration, never host secrets.
      const worker = await readFile(new URL('./worker.mjs', import.meta.url), 'utf8');
      const allowedHostname = new URL(this.config.fixture.url).hostname;
      creationAttempted = true;
      pending.vm = await this.provider.create(
        {
          name,
          snapshotId: this.config.snapshot.snapshotId,
          region: this.config.region,
          timeoutMs: this.config.sandboxTimeoutMs,
          credentials: this.config.credentials,
          networkPolicy: {
            allow: { [allowedHostname]: [{ transform: [{ headers: { Host: allowedHostname } }] }] },
            subnets: {
              deny: [
                '127.0.0.0/8',
                '10.0.0.0/8',
                '172.16.0.0/12',
                '192.168.0.0/16',
                '169.254.0.0/16',
              ],
            },
          },
        },
        AbortSignal.timeout(this.config.commandTimeoutMs),
      );
      result.createdAt = new Date().toISOString();
      result.sandboxId = IdSchema.parse(pending.vm.id);
      pending.cleanup.sandboxId = result.sandboxId;
      const signal = AbortSignal.timeout(this.config.commandTimeoutMs);
      await pending.vm.writeFiles(
        [
          { path: '/vercel/sandbox/aionguard-worker.mjs', content: worker },
          {
            path: '/vercel/sandbox/aionguard-request.json',
            content: JSON.stringify({
              url: this.config.fixture.url,
              navigationOrigins: this.config.fixture.navigationOrigins,
              requestPath,
              navigationTimeoutMs: this.config.navigationTimeoutMs,
            }),
          },
        ],
        signal,
      );
      result.collectionStartedAt = new Date().toISOString();
      const exitCode = await pending.vm.runWorker(this.config.commandTimeoutMs, signal);
      if (exitCode !== 0)
        throw new IsolationError(
          exitCode === 124 || exitCode === 137 ? 'TIMEOUT' : 'INVALID_EVIDENCE',
        );
      const bytes = await pending.vm.readResult(MAX_RESULT_BYTES, signal);
      if (bytes.length > MAX_RESULT_BYTES) throw new IsolationError('INVALID_EVIDENCE');
      const parsed: unknown = JSON.parse(bytes.toString('utf8'));
      const failed = WorkerFailureSchema.safeParse(parsed);
      if (failed.success) throw new IsolationError(failed.data.failure);
      const { observation, pngBase64 } = PayloadSchema.parse(parsed);
      const png = Buffer.from(pngBase64, 'base64');
      if (
        png.toString('base64') !== pngBase64 ||
        !validPng(png) ||
        !isAllowedNavigation(observation.finalUrl, this.config.fixture.navigationOrigins) ||
        !pathAllowed(observation.finalUrl, requestPath) ||
        observation.redirects.some(
          (url) =>
            !isAllowedNavigation(url, this.config!.fixture.navigationOrigins) ||
            !pathAllowed(url, requestPath),
        )
      )
        throw new IsolationError('INVALID_EVIDENCE');
      if (observation.formAction !== null) {
        const declared = new URL(observation.formAction);
        if (
          declared.username ||
          declared.password ||
          declared.origin !== observation.formDestinationOrigin
        )
          throw new IsolationError('INVALID_EVIDENCE');
      } else if (observation.formDestinationOrigin !== null)
        throw new IsolationError('INVALID_EVIDENCE');
      const observedAt = Date.parse(observation.observedAt);
      if (
        observedAt < Date.parse(result.collectionStartedAt) - 5_000 ||
        observedAt > Date.now() + 5_000
      )
        throw new IsolationError('INVALID_EVIDENCE');
      result.execution = 'SUCCEEDED';
      result.observation = observation;
      result.pngBase64 = pngBase64;
      result.failure = null;
    } catch (error) {
      result.failure =
        error instanceof IsolationError
          ? error.code
          : error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)
            ? 'TIMEOUT'
            : pending.vm
              ? 'INVALID_EVIDENCE'
              : 'PROVIDER_UNAVAILABLE';
      if (
        !pending.vm &&
        (!creationAttempted || (error instanceof IsolationError && error.creationRejected))
      ) {
        pending.cleanup.state = 'NOT_CREATED';
        pending.cleanup.sandboxId = null;
        this.pending.delete(name);
      }
    } finally {
      if (pending.vm) await this.cleanup(name, pending);
      else if (pending.cleanup.state === 'PENDING') pending.cleanup.state = 'UNRESOLVED';
      result.returnedAt = new Date().toISOString();
    }
    return InspectionResultSchema.parse(result);
  }

  private async cleanup(name: string, pending: Pending): Promise<void> {
    if (!pending.vm || !this.config) return;
    let stopped = false,
      deleted = false;
    try {
      const state = await pending.vm.stop(AbortSignal.timeout(this.config.cleanupTimeoutMs));
      stopped = state.status === 'stopped' || state.status === 'aborted';
      if (stopped) pending.cleanup.stoppedAt = new Date().toISOString();
    } catch {
      /* Keep the reservation; expiry and delete acknowledgement are not terminal proof. */
    }
    try {
      await pending.vm.delete(AbortSignal.timeout(this.config.cleanupTimeoutMs));
      deleted = true;
      pending.cleanup.deletedAt = new Date().toISOString();
    } catch {
      /* The receipt retains incomplete cleanup. */
    }
    pending.cleanup.state = stopped && deleted ? 'CONFIRMED' : 'UNRESOLVED';
    if (pending.cleanup.state === 'CONFIRMED') this.pending.delete(name);
  }
}

export function createMockInspector(
  source: InspectionResult['source'] = 'VERCEL_SANDBOX',
): Inspector {
  return {
    async inspect(fixtureId) {
      const now = new Date().toISOString();
      if (fixtureId !== FIXTURE_ID)
        return InspectionResultSchema.parse({
          execution: 'UNAVAILABLE',
          mode: 'MOCK',
          observation: null,
          pngBase64: null,
          source,
          sandboxId: null,
          createdAt: null,
          collectionStartedAt: null,
          returnedAt: now,
          cleanup: { state: 'NOT_CREATED', sandboxId: null, stoppedAt: null, deletedAt: null },
          failure: 'NAVIGATION_DENIED',
        });
      const id = `mock-${randomUUID()}`;
      return InspectionResultSchema.parse({
        execution: 'SUCCEEDED',
        mode: 'MOCK',
        observation: {
          finalUrl: 'https://fixture.aionguard.invalid/acme-login.html',
          title: 'Acme Login — MOCK',
          text: 'Software-verification fixture. No remote inspection occurred.',
          claimedService: 'ACME',
          passwordField: true,
          formAction: 'https://outside-idp.invalid/never-submit',
          formDestinationOrigin: 'https://outside-idp.invalid',
          redirects: [],
          observedAt: now,
        },
        pngBase64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3f8AAAAASUVORK5CYII=',
        source,
        sandboxId: id,
        createdAt: now,
        collectionStartedAt: now,
        returnedAt: now,
        cleanup: { state: 'CONFIRMED', sandboxId: id, stoppedAt: now, deletedAt: now },
        failure: null,
      });
    },
  };
}
