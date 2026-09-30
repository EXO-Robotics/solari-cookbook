import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  InspectionResultSchema,
  type InspectionResult,
  type Inspector,
} from '../../contracts/index.ts';
import { detectThreats } from '../detection/index.ts';
import { FIXTURE_ID, MAX_RESULT_BYTES } from './policy.ts';
import { IsolationError, type InspectionVm } from './provider.ts';
import {
  parseSolariPayload,
  solariProvider,
  validateSolariConfig,
  type SolariInspectorConfig,
  type InspectionObserver,
  type SolariProvider,
} from './solari.ts';

export type WarmPoolStatus = {
  state:
    'DISABLED' | 'EMPTY' | 'PREPARING' | 'READY' | 'INSPECTING' | 'RETIRING' | 'BLOCKED' | 'CLOSED';
  sandboxId: string | null;
  readyAt: string | null;
  expiresAt: string | null;
  inspectionCount: number;
  cleanupUnresolved: number;
  lastError: string | null;
};
type Slot = {
  vm: InspectionVm;
  id: string;
  createdAt: string;
  started: number;
  readyAt: string;
  count: number;
};

/** One bounded owned-fixture VM, with a fresh browser process for every observation.
 * Retention is a resource decision only: no heuristic findings never authorizes navigation.
 */
export class WarmSolariInspector implements Inspector {
  private readonly config: Required<SolariInspectorConfig> | null;
  private readonly maxAgeMs: number;
  private readonly idleTimeoutMs: number;
  private readonly maxInspections: number;
  private readonly now: () => number;
  private readonly observer?: InspectionObserver;
  private slot: Slot | null = null;
  private preparing: Promise<void> | null = null;
  private retiring: Promise<void> | null = null;
  private job: Promise<InspectionResult> | null = null;
  private closing: Promise<void> | null = null;
  private closed = false;
  private unresolved = 0;
  private lastError: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    config: SolariInspectorConfig | null,
    private readonly provider: SolariProvider = solariProvider,
    options: {
      maxAgeMs?: number;
      idleTimeoutMs?: number;
      maxInspections?: number;
      now?: () => number;
      observer?: InspectionObserver;
    } = {},
  ) {
    this.config = config === null ? null : validateSolariConfig(config);
    this.maxAgeMs = options.maxAgeMs ?? 240_000;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 120_000;
    this.maxInspections = options.maxInspections ?? 100;
    this.now = options.now ?? Date.now;
    this.observer = options.observer;
    if (
      ![this.maxAgeMs, this.idleTimeoutMs, this.maxInspections].every(
        (x) => Number.isInteger(x) && x > 0,
      ) ||
      this.maxAgeMs > 240_000
    )
      throw new Error('Invalid warm pool bounds');
  }
  private emit(event: string, detail?: Parameters<InspectionObserver>[1]): void {
    try {
      this.observer?.(event, detail);
    } catch {
      /* Diagnostic only. */
    }
  }
  private stamp(): string {
    return new Date(this.now()).toISOString();
  }
  status(): WarmPoolStatus {
    return {
      state: this.closed
        ? 'CLOSED'
        : !this.config
          ? 'DISABLED'
          : this.unresolved
            ? 'BLOCKED'
            : this.retiring
              ? 'RETIRING'
              : this.preparing
                ? 'PREPARING'
                : this.job
                  ? 'INSPECTING'
                  : this.slot
                    ? 'READY'
                    : 'EMPTY',
      sandboxId: this.slot?.id ?? null,
      readyAt: this.slot?.readyAt || null,
      expiresAt: this.slot ? new Date(this.slot.started + this.maxAgeMs).toISOString() : null,
      inspectionCount: this.slot?.count ?? 0,
      cleanupUnresolved: this.unresolved,
      lastError: this.lastError,
    };
  }
  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  private scheduleExpiry(): void {
    this.clearTimer();
    if (!this.slot || this.closed) return;
    const slot = this.slot;
    const remaining = Math.min(this.idleTimeoutMs, slot.started + this.maxAgeMs - this.now());
    this.timer = setTimeout(
      () => {
        this.timer = null;
        if (this.slot === slot && !this.job) void this.retire(slot, false);
      },
      Math.max(0, remaining),
    );
    this.timer.unref();
  }
  prepare(): Promise<void> {
    if (this.preparing) return this.preparing;
    if (this.closed || !this.config || this.slot || this.retiring || this.unresolved)
      return Promise.resolve();
    const promise = this.createSlot();
    this.preparing = promise;
    const clear = () => {
      if (this.preparing === promise) this.preparing = null;
    };
    void promise.then(clear, clear);
    return promise;
  }
  private async createSlot(): Promise<void> {
    if (!this.config) return;
    let vm: InspectionVm | null = null;
    let attempted = false;
    const started = this.now();
    try {
      const worker = await readFile(new URL('./worker.mjs', import.meta.url), 'utf8');
      if (this.closed) return;
      attempted = true;
      this.emit('provision_started');
      vm = await this.provider.create(
        { name: `aionguard-warm-${randomUUID()}`, config: this.config },
        AbortSignal.timeout(this.config.commandTimeoutMs),
      );
      this.emit('provision_complete');
      const slot: Slot = {
        vm,
        id: `solari-${createHash('sha256').update(vm.id).digest('hex').slice(0, 32)}`,
        started,
        createdAt: this.stamp(),
        readyAt: '',
        count: 0,
      };
      this.slot = slot;
      if (this.closed) {
        await this.retire(slot, false);
        return;
      }
      this.emit('setup_started');
      await vm.writeFiles(
        [{ path: '/vercel/sandbox/aionguard-worker.mjs', content: worker }],
        AbortSignal.timeout(this.config.setupTimeoutMs),
      );
      if (this.closed || this.now() + this.config.commandTimeoutMs >= started + this.maxAgeMs) {
        this.lastError = 'TIMEOUT';
        await this.retire(slot, false);
        return;
      }
      this.emit('setup_complete');
      slot.readyAt = this.stamp();
      this.lastError = null;
      this.scheduleExpiry();
    } catch (error) {
      this.lastError = this.failure(error, !!vm);
      if (vm && this.slot) await this.retire(this.slot, false);
      else if (attempted && !(error instanceof IsolationError && error.creationRejected))
        this.unresolved++;
    }
  }
  private failure(error: unknown, hasVm: boolean): NonNullable<InspectionResult['failure']> {
    return error instanceof IsolationError
      ? error.code
      : error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)
        ? 'TIMEOUT'
        : hasVm
          ? 'INVALID_EVIDENCE'
          : 'PROVIDER_UNAVAILABLE';
  }
  private empty(failure: InspectionResult['failure']): InspectionResult {
    return {
      execution: 'UNAVAILABLE',
      mode: 'LIVE',
      observation: null,
      pngBase64: null,
      source: 'SOLARI_SANDBOX',
      sandboxId: null,
      createdAt: null,
      collectionStartedAt: null,
      returnedAt: this.stamp(),
      cleanup: { state: 'NOT_CREATED', sandboxId: null, stoppedAt: null, deletedAt: null },
      failure,
    };
  }
  inspect(fixtureId: string): Promise<InspectionResult> {
    if (fixtureId !== FIXTURE_ID) return Promise.resolve(this.empty('NAVIGATION_DENIED'));
    if (!this.config) return Promise.resolve(this.empty('NOT_CONFIGURED'));
    if (this.closed || this.job || this.retiring || this.unresolved)
      return Promise.resolve(this.empty('CAPACITY'));
    const promise = this.runInspection();
    this.job = promise;
    const clear = () => {
      if (this.job === promise) this.job = null;
    };
    void promise.then(clear, clear);
    return promise;
  }
  private async runInspection(): Promise<InspectionResult> {
    this.emit('inspection_started');
    const config = this.config!;
    this.clearTimer();
    if (
      this.slot &&
      !this.preparing &&
      (this.slot.count >= this.maxInspections ||
        this.now() + config.commandTimeoutMs >= this.slot.started + this.maxAgeMs)
    )
      await this.retire(this.slot, false);
    if (this.unresolved || this.closed) return this.empty('CAPACITY');
    await this.prepare();
    const slot = this.slot;
    if (!slot || this.closed)
      return this.empty(this.unresolved ? 'CAPACITY' : 'PROVIDER_UNAVAILABLE');
    this.clearTimer();
    const acquiredAt = this.stamp();
    const reused = slot.count > 0;
    slot.count++;
    const result = this.empty(null);
    result.sandboxId = slot.id;
    result.createdAt = slot.createdAt;
    result.cleanup = { state: 'RETAINED', sandboxId: slot.id, stoppedAt: null, deletedAt: null };
    result.session = {
      mode: 'WARM',
      readyAt: slot.readyAt,
      acquiredAt,
      reused,
      inspectionCount: slot.count,
      disposition: 'RETAINED',
    };
    try {
      const inspectionNonce = randomUUID();
      const signal = AbortSignal.timeout(config.commandTimeoutMs);
      await slot.vm.writeFiles(
        [
          {
            path: '/vercel/sandbox/aionguard-request.json',
            content: JSON.stringify({
              inspectionNonce,
              ...(this.observer ? { benchmarkTiming: true } : {}),
              url: config.fixture.url,
              navigationOrigins: config.fixture.navigationOrigins,
              requestPath: new URL(config.fixture.url).pathname.replace(/[^/]*$/, ''),
              navigationTimeoutMs: config.navigationTimeoutMs,
            }),
          },
        ],
        signal,
      );
      result.collectionStartedAt = this.stamp();
      this.emit('collection_started');
      const exit = await slot.vm.runWorker(config.commandTimeoutMs, signal);
      if (exit !== 0)
        throw new IsolationError(exit === 124 || exit === 137 ? 'TIMEOUT' : 'INVALID_EVIDENCE');
      const bytes = await slot.vm.readResult(MAX_RESULT_BYTES, signal);
      this.emit('evidence_received');
      const payload = parseSolariPayload(
        bytes,
        config,
        result.collectionStartedAt,
        inspectionNonce,
      );
      this.emit('evidence_validated');
      if (payload.benchmarkTiming) this.emit('worker_timing', payload.benchmarkTiming);
      result.execution = 'SUCCEEDED';
      result.observation = payload.observation;
      result.pngBase64 = payload.pngBase64;
      if (
        detectThreats(payload.observation, config.fixture.identityProviderOrigins).length ||
        slot.count >= this.maxInspections ||
        this.now() + config.commandTimeoutMs >= slot.started + this.maxAgeMs ||
        this.closed
      ) {
        result.cleanup.state = 'PENDING';
        result.session.disposition = 'RETIRED';
        void this.retire(slot, !this.closed);
      } else this.scheduleExpiry();
    } catch (error) {
      result.failure = this.failure(error, true);
      this.lastError = result.failure;
      result.cleanup.state = 'PENDING';
      result.session.disposition = 'RETIRED';
      void this.retire(slot, !this.closed);
    }
    result.returnedAt = this.stamp();
    this.emit('inspection_returned');
    return InspectionResultSchema.parse(result);
  }
  private retire(slot: Slot, replenish: boolean): Promise<void> {
    if (this.retiring) return this.retiring;
    // Detach before any await: tainted evidence can never leave this VM admissible.
    if (this.slot === slot) this.slot = null;
    this.clearTimer();
    const operation = this.cleanupSlot(slot);
    this.retiring = operation;
    void operation.then(() => {
      if (this.retiring === operation) this.retiring = null;
      if (replenish && !this.closed && !this.unresolved) void this.prepare();
    });
    return operation;
  }
  private async cleanupSlot(slot: Slot): Promise<void> {
    this.emit('cleanup_started');
    let stopped = false,
      deleted = false;
    try {
      const state = await slot.vm.stop(AbortSignal.timeout(this.config!.cleanupTimeoutMs));
      stopped = state.status === 'stopped' || state.status === 'aborted';
    } catch {
      /* unresolved */
    }
    try {
      await slot.vm.delete(AbortSignal.timeout(this.config!.cleanupTimeoutMs));
      deleted = true;
    } catch {
      /* unresolved */
    }
    this.emit('cleanup_complete');
    if (!stopped || !deleted) {
      this.unresolved++;
      this.lastError = 'CLEANUP_UNRESOLVED';
    }
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.clearTimer();
    this.closing = (async () => {
      await this.job;
      await this.preparing;
      await this.retiring;
      if (this.slot) await this.retire(this.slot, false);
    })();
    return this.closing;
  }
}
