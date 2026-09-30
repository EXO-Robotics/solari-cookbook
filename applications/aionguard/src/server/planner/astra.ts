import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ActionIdSchema,
  HypothesisIdSchema,
  InvestigationDecisionSchema,
  SubjectSchema,
  type InvestigationDecision,
  type Planner,
  type PlannerView,
} from '../../contracts/index.ts';
import { serializePlannerRequest } from './view.ts';

export const ASTRA_MODEL = 'gpt-6-astra';
export const DEFAULT_CODEX_PATH = '/Applications/Codex.app/Contents/Resources/codex';
// This process is a decision transport, not a general Codex workspace. Keep
// authentication owned by the CLI while excluding personal context and tools.
export const ASTRA_DISABLED_FEATURES = Object.freeze([
  'shell_tool',
  'apps',
  'multi_agent',
  'multi_agent_v2',
  'plugins',
  'remote_plugin',
  'memories',
  'hooks',
  'skill_search',
  'browser_use',
  'computer_use',
  'image_generation',
  'view_image',
  'goals',
  'sleep_tool',
  'workspace_dependencies',
]);
const MAX_REQUEST_BYTES = 64_000;
const MAX_OUTPUT_BYTES = 16_000;
const MAX_PROCESS_BYTES = 128_000;
export type PlannerFailureCode =
  'NOT_AVAILABLE' | 'TIMEOUT' | 'OUTPUT_LIMIT' | 'INVALID_RESPONSE' | 'TRANSPORT_FAILED';
export class PlannerUnavailableError extends Error {
  constructor(public readonly code: PlannerFailureCode) {
    super(`Astra planner unavailable: ${code}`);
    this.name = 'PlannerUnavailableError';
  }
}
export interface PlannerTrace {
  model: string;
  requestSha256: string;
  requestBytes: number;
  responseBytes: number;
  elapsedMs: number;
  outcome: 'SUCCEEDED' | PlannerFailureCode;
}
export interface CliInvocation {
  executable: string;
  args: string[];
  input: string;
  cwd: string;
  timeoutMs: number;
}
export type CliRunner = (invocation: CliInvocation) => Promise<void>;

// The root stays an object, while the nested union gives STOP and INVESTIGATE
// exactly the same shapes as our application contract. Nullable unrelated fields
// previously permitted a STOP that the decoder could not accept.
export const ASTRA_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    decision: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['INVESTIGATE'] },
            actionId: { type: 'string', enum: ActionIdSchema.options },
            target: { type: 'string', enum: SubjectSchema.options },
            hypothesisIds: {
              type: 'array',
              items: { type: 'string', enum: HypothesisIdSchema.options },
              minItems: 1,
              maxItems: 2,
            },
            rationale: { type: 'string', minLength: 1, maxLength: 400 },
          },
          required: ['type', 'actionId', 'target', 'hypothesisIds', 'rationale'],
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['STOP'] },
            rationale: { type: 'string', minLength: 1, maxLength: 400 },
          },
          required: ['type', 'rationale'],
        },
      ],
    },
  },
  required: ['decision'],
};

export const runCliProcess: CliRunner = ({ executable, args, input, cwd, timeoutMs }) =>
  new Promise((resolve, reject) => {
    let failure: PlannerFailureCode | undefined;
    let bytes = 0;
    let turnStarted = false;
    let turnCompleted = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const allowedEnvironment = new Set([
      'HOME',
      'USER',
      'LOGNAME',
      'PATH',
      'TMPDIR',
      'TMP',
      'TEMP',
      'LANG',
      'LC_ALL',
      'LC_CTYPE',
      'CODEX_HOME',
    ]);
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => allowedEnvironment.has(key)),
    );
    const child = spawn(executable, args, {
      cwd,
      env,
      shell: false,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    function stop(code: PlannerFailureCode) {
      failure ??= code;
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          child.kill('SIGTERM');
        }
        killTimer ??= setTimeout(() => {
          try {
            if (child.pid) process.kill(-child.pid, 'SIGKILL');
          } catch {
            child.kill('SIGKILL');
          }
        }, 1_000);
        killTimer.unref();
      }
    }
    const timeout = setTimeout(() => stop('TIMEOUT'), timeoutMs);
    const count = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_PROCESS_BYTES) stop('OUTPUT_LIMIT');
    };
    let eventBuffer = '';
    function inspectEvent(line: string): PlannerFailureCode | undefined {
      try {
        const event = JSON.parse(line) as { type?: string; item?: { type?: string } };
        if (!event || typeof event !== 'object' || Array.isArray(event)) return 'INVALID_RESPONSE';
        if (event.type === 'turn.failed' || event.type === 'error') return 'TRANSPORT_FAILED';
        if (event.type === 'thread.started') return;
        if (event.type === 'turn.started') {
          if (turnStarted || turnCompleted) return 'INVALID_RESPONSE';
          turnStarted = true;
          return;
        }
        if (event.type === 'turn.completed') {
          if (!turnStarted || turnCompleted) return 'INVALID_RESPONSE';
          turnCompleted = true;
          return;
        }
        if (['item.started', 'item.updated', 'item.completed'].includes(event.type ?? '')) {
          if (event.item?.type === 'error') return 'TRANSPORT_FAILED';
          if (
            !turnStarted ||
            turnCompleted ||
            !event.item?.type ||
            !['agent_message', 'reasoning'].includes(event.item.type)
          )
            return 'INVALID_RESPONSE';
          return;
        }
        // Unknown events fail closed, including newly introduced tool types.
        return 'INVALID_RESPONSE';
      } catch {
        return 'INVALID_RESPONSE';
      }
    }
    child.stdout.on('data', (chunk: Buffer) => {
      count(chunk);
      if (failure) return;
      eventBuffer += chunk.toString('utf8');
      let end: number;
      while ((end = eventBuffer.indexOf('\n')) >= 0) {
        const line = eventBuffer.slice(0, end).trim();
        eventBuffer = eventBuffer.slice(end + 1);
        if (!line) continue;
        const issue = inspectEvent(line);
        if (issue) stop(issue);
      }
    });
    child.stderr.on('data', count);
    child.stdin.on('error', () => {
      /* EPIPE follows process failure, handled on close. */
    });
    child.on('error', () => {
      failure = 'NOT_AVAILABLE';
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      if (eventBuffer.trim() && !failure) failure = inspectEvent(eventBuffer);
      if (failure) reject(new PlannerUnavailableError(failure));
      else if (code !== 0 || !turnCompleted)
        reject(new PlannerUnavailableError('TRANSPORT_FAILED'));
      else resolve();
    });
    child.stdin.end(input);
  });

export interface CliAstraPlannerOptions {
  executable?: string;
  timeoutMs?: number;
  model?: string;
  /** Dependency injection for offline tests; never selected by an HTTP input. */
  runner?: CliRunner;
  onTrace?: (trace: PlannerTrace) => void;
}
export class CliAstraPlanner implements Planner {
  private readonly options: CliAstraPlannerOptions;
  constructor(options: CliAstraPlannerOptions = {}) {
    this.options = options;
  }
  async choose(view: PlannerView): Promise<InvestigationDecision> {
    const input = serializePlannerRequest(view);
    const requestBytes = Buffer.byteLength(input);
    if (requestBytes > MAX_REQUEST_BYTES) throw new PlannerUnavailableError('OUTPUT_LIMIT');
    const started = performance.now();
    const model = this.options.model ?? ASTRA_MODEL;
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model)) throw new PlannerUnavailableError('NOT_AVAILABLE');
    const trace: PlannerTrace = {
      model,
      requestSha256: createHash('sha256').update(input).digest('hex'),
      requestBytes,
      responseBytes: 0,
      elapsedMs: 0,
      outcome: 'TRANSPORT_FAILED',
    };
    const directory = await mkdtemp(path.join(tmpdir(), 'aionguard-planner-'));
    try {
      const schemaPath = path.join(directory, 'decision-schema.json');
      const responsePath = path.join(directory, 'decision.json');
      await writeFile(schemaPath, JSON.stringify(ASTRA_OUTPUT_SCHEMA), { mode: 0o600 });
      const args = [
        'exec',
        '--ignore-user-config',
        '--ephemeral',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        ...ASTRA_DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
        '--enable',
        'skip_host_skill_discovery',
        '-c',
        'web_search="disabled"',
        '-c',
        'project_doc_max_bytes=0',
        '-c',
        'memories.use_memories=false',
        '-c',
        'memories.generate_memories=false',
        '-c',
        'suppress_unstable_features_warning=true',
        '-c',
        'model_reasoning_effort="low"',
        '--model',
        model,
        '--cd',
        directory,
        '--output-schema',
        schemaPath,
        '--output-last-message',
        responsePath,
        '--json',
        '-',
      ];
      const executable =
        this.options.executable ?? process.env.AIONGUARD_CODEX_PATH ?? DEFAULT_CODEX_PATH;
      const timeoutMs = this.options.timeoutMs ?? 60_000;
      if (
        !path.isAbsolute(executable) ||
        !Number.isSafeInteger(timeoutMs) ||
        timeoutMs < 1 ||
        timeoutMs > 120_000
      )
        throw new PlannerUnavailableError('NOT_AVAILABLE');
      await (this.options.runner ?? runCliProcess)({
        executable,
        args,
        input,
        cwd: directory,
        timeoutMs,
      });
      const metadata = await lstat(responsePath).catch(() => {
        throw new PlannerUnavailableError('INVALID_RESPONSE');
      });
      if (!metadata.isFile() || metadata.isSymbolicLink())
        throw new PlannerUnavailableError('INVALID_RESPONSE');
      if (metadata.size > MAX_OUTPUT_BYTES) throw new PlannerUnavailableError('OUTPUT_LIMIT');
      const response = await readFile(responsePath, 'utf8');
      trace.responseBytes = Buffer.byteLength(response);
      let raw: unknown;
      try {
        raw = JSON.parse(response);
      } catch {
        throw new PlannerUnavailableError('INVALID_RESPONSE');
      }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new PlannerUnavailableError('INVALID_RESPONSE');
      const r = raw as Record<string, unknown>;
      if (Object.keys(r).join(',') !== 'decision')
        throw new PlannerUnavailableError('INVALID_RESPONSE');
      const parsed = InvestigationDecisionSchema.safeParse(r.decision);
      if (
        !parsed.success ||
        (parsed.data.type === 'INVESTIGATE' &&
          new Set(parsed.data.hypothesisIds).size !== parsed.data.hypothesisIds.length)
      )
        throw new PlannerUnavailableError('INVALID_RESPONSE');
      trace.outcome = 'SUCCEEDED';
      return parsed.data;
    } catch (error) {
      const failure =
        error instanceof PlannerUnavailableError
          ? error
          : new PlannerUnavailableError('TRANSPORT_FAILED');
      trace.outcome = failure.code;
      throw failure;
    } finally {
      trace.elapsedMs = Math.round(performance.now() - started);
      await rm(directory, { recursive: true, force: true });
      // Diagnostic observers cannot alter the planner outcome. No prompt, model prose,
      // CLI stdout/stderr, authentication data, or local file paths enter the trace.
      try {
        this.options.onTrace?.({ ...trace });
      } catch {
        /* observer only */
      }
    }
  }
}
