import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
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
import { GatewayError, SandboxClient, type Sandbox } from '@solarisdk/sandbox';
import {
  BROWSER_VERSION,
  normalizeFixtureTarget,
  registeredFixture,
  type RegisteredFixture,
} from './policy.ts';
import { FIXTURE_ID, isAllowedNavigation, MAX_RESULT_BYTES, validPng } from './policy.ts';
import { pathAllowed } from './worker.mjs';
import { IsolationError, type InspectionVm } from './provider.ts';

const WorkerTimingSchema = z
  .object({
    startedAt: z.string().datetime(),
    events: z
      .object({
        workerStarted: z.number().finite().min(0),
        browserReady: z.number().finite().min(0),
        navigationStarted: z.number().finite().min(0),
        pageLoaded: z.number().finite().min(0),
        factsCollected: z.number().finite().min(0),
        screenshotCollected: z.number().finite().min(0),
      })
      .strict(),
  })
  .strict()
  .refine((value) => {
    const events = Object.values(value.events);
    return events.every(
      (time, index) => time <= 60_000 && (index === 0 || time >= events[index - 1]!),
    );
  });
export type WorkerTiming = z.infer<typeof WorkerTimingSchema>;
export type InspectionObserver = (event: string, detail?: WorkerTiming) => void;

const PayloadSchema = z
  .object({
    observation: InspectionObservationSchema,
    inspectionNonce: z.uuid().optional(),
    benchmarkTiming: WorkerTimingSchema.optional(),
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

export class SolariInspector implements Inspector {
  private readonly config: Required<SolariInspectorConfig> | null;
  private readonly pending = new Map<string, Pending>();

  constructor(
    config: SolariInspectorConfig | null,
    private readonly provider: SolariProvider = solariProvider,
    private readonly observer?: InspectionObserver,
  ) {
    this.config = config === null ? null : validateSolariConfig(config);
  }

  private emit(event: string, detail?: WorkerTiming): void {
    // Optional measurement must never prevent lifecycle cleanup or alter a verdict.
    try {
      this.observer?.(event, detail);
    } catch {
      /* Diagnostic observer only. */
    }
  }

  /** Unresolved cleanup counts against admission until independently resolved. */
  outstandingCleanups(): Cleanup[] {
    return [...this.pending.values()].map((item) => CleanupSchema.parse(item.cleanup));
  }

  async inspect(fixtureId: string): Promise<InspectionResult> {
    this.emit('inspection_started');
    const empty: InspectionResult = {
      execution: 'UNAVAILABLE',
      mode: 'LIVE',
      observation: null,
      pngBase64: null,
      source: 'SOLARI_SANDBOX',
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
    const inspectionNonce = randomUUID();
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
      creationAttempted = true;
      this.emit('provision_started');
      pending.vm = await this.provider.create(
        {
          name,
          config: this.config,
        },
        AbortSignal.timeout(this.config.commandTimeoutMs),
      );
      this.emit('provision_complete');
      result.createdAt = new Date().toISOString();
      result.sandboxId = IdSchema.parse(
        `solari-${createHash('sha256').update(pending.vm.id).digest('hex').slice(0, 32)}`,
      );
      pending.cleanup.sandboxId = result.sandboxId;
      this.emit('setup_started');
      const setupSignal = AbortSignal.timeout(this.config.setupTimeoutMs);
      await pending.vm.writeFiles(
        [
          { path: '/vercel/sandbox/aionguard-worker.mjs', content: worker },
          {
            path: '/vercel/sandbox/aionguard-request.json',
            content: JSON.stringify({
              ...(this.observer ? { benchmarkTiming: true } : {}),
              inspectionNonce,
              url: this.config.fixture.url,
              navigationOrigins: this.config.fixture.navigationOrigins,
              requestPath,
              navigationTimeoutMs: this.config.navigationTimeoutMs,
            }),
          },
        ],
        setupSignal,
      );
      this.emit('setup_complete');
      const signal = AbortSignal.timeout(this.config.commandTimeoutMs);
      result.collectionStartedAt = new Date().toISOString();
      this.emit('collection_started');
      const exitCode = await pending.vm.runWorker(this.config.commandTimeoutMs, signal);
      if (exitCode !== 0)
        throw new IsolationError(
          exitCode === 124 || exitCode === 137 ? 'TIMEOUT' : 'INVALID_EVIDENCE',
        );
      const bytes = await pending.vm.readResult(MAX_RESULT_BYTES, signal);
      this.emit('evidence_received');
      const { observation, pngBase64, benchmarkTiming } = parseSolariPayload(
        bytes,
        this.config,
        result.collectionStartedAt,
        inspectionNonce,
      );
      this.emit('evidence_validated');
      if (benchmarkTiming) this.emit('worker_timing', benchmarkTiming);
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
      if (pending.vm) {
        this.emit('cleanup_started');
        await this.cleanup(name, pending);
        this.emit('cleanup_complete');
      } else if (pending.cleanup.state === 'PENDING') pending.cleanup.state = 'UNRESOLVED';
      result.returnedAt = new Date().toISOString();
      this.emit('inspection_returned');
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

export interface SolariInspectorConfig {
  fixture: RegisteredFixture;
  apiKey: string;
  baseUrl?: string;
  setupTimeoutMs?: number;
  commandTimeoutMs?: number;
  navigationTimeoutMs?: number;
  cleanupTimeoutMs?: number;
  maxConcurrent?: number;
}

export function validateSolariConfig(
  config: SolariInspectorConfig,
): Required<SolariInspectorConfig> {
  const fixture = registeredFixture(
    config.fixture.url,
    config.fixture.identityProviderOrigins,
    'url',
  );
  if (
    fixture.id !== config.fixture.id ||
    JSON.stringify(fixture.navigationOrigins) !== JSON.stringify(config.fixture.navigationOrigins)
  )
    throw new Error('Fixture registry mismatch');
  const values = z
    .object({
      apiKey: z.string().min(1),
      baseUrl: z.literal('https://api.getsolari.com'),
      setupTimeoutMs: z.number().int().min(30_000).max(240_000),
      commandTimeoutMs: z.number().int().min(5_000).max(60_000),
      navigationTimeoutMs: z.number().int().min(1_000).max(30_000),
      cleanupTimeoutMs: z.number().int().min(1_000).max(30_000),
      maxConcurrent: z.literal(1),
    })
    .parse({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? 'https://api.getsolari.com',
      setupTimeoutMs: config.setupTimeoutMs ?? 210_000,
      commandTimeoutMs: config.commandTimeoutMs ?? 30_000,
      navigationTimeoutMs: config.navigationTimeoutMs ?? 15_000,
      cleanupTimeoutMs: config.cleanupTimeoutMs ?? 15_000,
      maxConcurrent: config.maxConcurrent ?? 1,
    });
  if (values.navigationTimeoutMs >= values.commandTimeoutMs) throw new Error('Invalid deadlines');
  return { fixture, ...values };
}

export function solariConfigFromEnv(
  env: NodeJS.ProcessEnv,
): Required<SolariInspectorConfig> | null {
  if (!env.SOLARI_API_KEY || (!env.AIONGUARD_FIXTURE_URL && !env.AIONGUARD_FIXTURE_ORIGIN))
    return null;
  try {
    const target = env.AIONGUARD_FIXTURE_URL
      ? normalizeFixtureTarget(env.AIONGUARD_FIXTURE_URL, 'url')
      : normalizeFixtureTarget(env.AIONGUARD_FIXTURE_ORIGIN!, 'origin');
    if (
      env.AIONGUARD_FIXTURE_ORIGIN &&
      normalizeFixtureTarget(env.AIONGUARD_FIXTURE_ORIGIN, 'origin').origin !== target.origin
    )
      return null;
    return validateSolariConfig({
      apiKey: env.SOLARI_API_KEY,
      baseUrl: env.SOLARI_BASE_URL,
      fixture: registeredFixture(
        target.url,
        (env.AIONGUARD_IDP_ORIGINS ?? '').split(',').filter(Boolean),
        'url',
      ),
      setupTimeoutMs: Number(env.AIONGUARD_SOLARI_SETUP_TIMEOUT_MS ?? 210_000),
      commandTimeoutMs: Number(env.AIONGUARD_COMMAND_TIMEOUT_MS ?? 30_000),
      navigationTimeoutMs: Number(env.AIONGUARD_NAVIGATION_TIMEOUT_MS ?? 15_000),
      cleanupTimeoutMs: Number(env.AIONGUARD_CLEANUP_TIMEOUT_MS ?? 15_000),
      maxConcurrent: Number(env.AIONGUARD_MAX_CONCURRENT_SANDBOXES ?? 1),
    });
  } catch {
    return null;
  }
}

export interface SolariProvider {
  create(
    options: { name: string; config: Required<SolariInspectorConfig> },
    signal: AbortSignal,
  ): Promise<InspectionVm>;
}

/** Race SDK websocket calls too; its RPC timeout alone does not bound connect/retries. */
async function bounded<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let listener: (() => void) | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        listener = () => reject(new IsolationError('TIMEOUT'));
        signal.addEventListener('abort', listener, { once: true });
      }),
    ]);
  } finally {
    if (listener) signal.removeEventListener('abort', listener);
  }
}

/** Owned demonstration fixtures only. Solari has no verified provider egress filter here.
 * /vercel/sandbox is a compatibility directory for the shared worker, not a provider identity.
 */
export const solariProvider: SolariProvider = {
  async create({ name, config }, createSignal) {
    let activeSignal = createSignal;
    const client = new SandboxClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      callTimeoutMs: config.setupTimeoutMs,
      fetch: (input, init) => {
        activeSignal.throwIfAborted();
        return fetch(input, {
          ...init,
          signal: AbortSignal.any([activeSignal, ...(init?.signal ? [init.signal] : [])]),
        });
      },
    });
    let sandbox: Sandbox;
    try {
      sandbox = await bounded(
        client.create({
          template: 'base',
          cpu: 2,
          memMb: 2048,
          envs: {},
          volumes: [],
          metadata: { application: 'aionguard', inspection: name },
          timeoutMs: 300_000,
          lifecycle: { onTimeout: 'kill' },
        }),
        createSignal,
      );
    } catch (error) {
      if (error instanceof GatewayError)
        throw new IsolationError(
          error.status === 429 ? 'CAPACITY' : 'PROVIDER_UNAVAILABLE',
          [400, 401, 402, 403, 404, 422, 429].includes(error.status),
        );
      throw new IsolationError(createSignal.aborted ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE');
    }
    let absenceConfirmed = false;
    let prepared = false;
    // Filtered inventories contradicted one another in the benchmark. Use
    // repeated, complete unfiltered inventories and match our owned identity.
    // This is control-plane reconciliation, not physical erasure attestation.
    async function confirmAbsent(signal: AbortSignal): Promise<boolean> {
      return reconcileSolariSandbox(client, sandbox.id, name, signal);
    }

    return {
      id: sandbox.id,
      async writeFiles(files, signal) {
        activeSignal = signal;
        // Static install recipe only, before processing content. No guest credentials.
        if (!prepared) {
          const setup = await bounded(
            sandbox.commands.run('sh', {
              args: [
                '-c',
                `mkdir -p /vercel/sandbox && cd /vercel/sandbox && npm install --no-audit --no-fund --ignore-scripts --save-exact playwright@${BROWSER_VERSION} && PLAYWRIGHT_BROWSERS_PATH=/vercel/sandbox/ms-playwright npx playwright install --with-deps chromium`,
              ],
              timeoutMs: config.setupTimeoutMs,
            }),
            signal,
          );
          if (setup.exitCode !== 0) throw new IsolationError('PROVIDER_UNAVAILABLE');
          await bounded(sandbox.connect(), signal);
          const readiness = await bounded(
            sandbox.commands.run('node', {
              args: [
                '-e',
                "const {chromium}=require('/vercel/sandbox/node_modules/playwright');(async()=>{const b=await chromium.launch({headless:true});await b.close()})().catch(()=>process.exit(1))",
              ],
              env: { PLAYWRIGHT_BROWSERS_PATH: '/vercel/sandbox/ms-playwright' },
              timeoutMs: 15_000,
            }),
            signal,
          );
          if (readiness.exitCode !== 0) throw new IsolationError('PROVIDER_UNAVAILABLE');
          prepared = true;
        }
        for (const file of files)
          await bounded(sandbox.files.write(file.path, file.content), signal);
      },
      async runWorker(timeoutMs, signal) {
        activeSignal = signal;
        const result = await bounded(
          sandbox.commands.run('node', {
            args: ['--max-old-space-size=192', '/vercel/sandbox/aionguard-worker.mjs'],
            cwd: '/vercel/sandbox',
            env: { PLAYWRIGHT_BROWSERS_PATH: '/vercel/sandbox/ms-playwright' },
            timeoutMs,
          }),
          signal,
        );
        return result.exitCode;
      },
      async readResult(maxBytes, signal) {
        activeSignal = signal;
        // Bound bytes inside the guest before transferring anything to this process.
        const result = await bounded(
          sandbox.commands.run('node', {
            args: [
              '-e',
              `const fs=require('fs');const p='/vercel/sandbox/aionguard-result.json';if(fs.statSync(p).size>${maxBytes})process.exit(2);process.stdout.write(fs.readFileSync(p))`,
            ],
            timeoutMs: config.commandTimeoutMs,
          }),
          signal,
        );
        if (result.exitCode !== 0 || Buffer.byteLength(result.stdout) > maxBytes)
          throw new IsolationError('INVALID_EVIDENCE');
        return Buffer.from(result.stdout);
      },
      async stop(signal) {
        activeSignal = signal;
        try {
          await bounded(sandbox.kill(), signal);
        } catch {
          // Signed capabilities can expire after termination. A failed kill is
          // not absence proof, but must not skip authoritative reconciliation.
          signal.throwIfAborted();
        }
        absenceConfirmed = await confirmAbsent(signal);
        return { status: absenceConfirmed ? 'stopped' : 'unknown' };
      },
      async delete(signal) {
        activeSignal = signal;
        if (absenceConfirmed) return;
        // A successful termination may precede inventory convergence, and its
        // signed capability can become invalid. Reconcile before repeating kill.
        absenceConfirmed = await confirmAbsent(signal);
        if (absenceConfirmed) return;
        await bounded(sandbox.kill(), signal);
        absenceConfirmed = await confirmAbsent(signal);
        if (!absenceConfirmed) throw new IsolationError('PROVIDER_UNAVAILABLE');
      },
    };
  },
};

/** Bounded inventory convergence; never interpret a paginated result as absence. */
export async function waitForInventoryAbsence(
  list: () => Promise<{ sandboxes: unknown[]; nextCursor?: string | null }>,
  signal: AbortSignal,
  pause: () => Promise<void> = () => delay(250, undefined, { signal }),
): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt++) {
    signal.throwIfAborted();
    const page = await list();
    if (page.sandboxes.length === 0 && !page.nextCursor) return true;
    if (attempt < 9) await pause();
  }
  return false;
}

/** Shared cold/warm validation. A warm job must bind evidence to its unique nonce. */
export function parseSolariPayload(
  bytes: Buffer,
  config: Required<SolariInspectorConfig>,
  collectionStartedAt: string,
  expectedNonce?: string,
) {
  const requestPath = new URL(config.fixture.url).pathname.replace(/[^/]*$/, '');
  if (bytes.length > MAX_RESULT_BYTES) throw new IsolationError('INVALID_EVIDENCE');
  const parsed: unknown = JSON.parse(bytes.toString('utf8'));
  const failed = WorkerFailureSchema.safeParse(parsed);
  if (failed.success) throw new IsolationError(failed.data.failure);
  const { observation, pngBase64, benchmarkTiming, inspectionNonce } = PayloadSchema.parse(parsed);
  if (expectedNonce !== undefined && inspectionNonce !== expectedNonce)
    throw new IsolationError('INVALID_EVIDENCE');
  const png = Buffer.from(pngBase64, 'base64');
  if (
    png.toString('base64') !== pngBase64 ||
    !validPng(png) ||
    !isAllowedNavigation(observation.finalUrl, config.fixture.navigationOrigins) ||
    !pathAllowed(observation.finalUrl, requestPath) ||
    observation.redirects.some(
      (url) =>
        !isAllowedNavigation(url, config.fixture.navigationOrigins) ||
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
  if (observedAt < Date.parse(collectionStartedAt) - 5_000 || observedAt > Date.now() + 5_000)
    throw new IsolationError('INVALID_EVIDENCE');
  return { observation, pngBase64, benchmarkTiming };
}

/** Reconcile one owned resource through complete inventories; never accept one empty filtered list. */
export async function reconcileSolariSandbox(
  client: Pick<SandboxClient, 'kill' | 'list' | 'get'>,
  sandboxId: string,
  inspection: string,
  signal: AbortSignal,
  pause: () => Promise<void> = () => delay(150, undefined, { signal }),
): Promise<boolean> {
  for (let i = 0; i < 3; i++) {
    try {
      await bounded(client.kill(sandboxId), signal);
    } catch {
      /* Absence still needs repeated complete inventory observations. */
    }
  }
  let absentSamples = 0;
  for (let sample = 0; sample < 20; sample++) {
    signal.throwIfAborted();
    let cursor: string | undefined;
    let complete = false;
    let present = false;
    for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
      const page = await bounded(
        client.list({ limit: 100, ...(cursor ? { cursor } : {}) }),
        signal,
      );
      present ||= page.sandboxes.some(
        (item) => item.sandboxId === sandboxId || item.metadata?.inspection === inspection,
      );
      if (!page.nextCursor) {
        complete = true;
        break;
      }
      cursor = page.nextCursor;
    }
    if (!complete) return false;
    // A point lookup that still sees the resource contradicts an empty inventory.
    try {
      await bounded(client.get(sandboxId), signal);
      present = true;
    } catch (error) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('status' in error) ||
        error.status !== 404
      )
        return false;
    }
    absentSamples = present ? 0 : absentSamples + 1;
    if (absentSamples >= 10) return true;
    if (present) {
      try {
        await bounded(client.kill(sandboxId), signal);
      } catch {
        /* Retain reservation unless reconciled. */
      }
    }
    if (sample < 19) await pause();
  }
  return false;
}
