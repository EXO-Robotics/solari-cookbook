import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { InspectionObservationSchema, type InspectionObservation } from '../../contracts/index.ts';
import { detectThreats, THREAT_CATEGORIES } from '../detection/index.ts';
import {
  ASTRA_DISABLED_FEATURES,
  ASTRA_MODEL,
  DEFAULT_CODEX_PATH,
  PlannerUnavailableError,
  runCliProcess,
  type CliRunner,
  type PlannerFailureCode,
} from './astra.ts';

/** The model receives no page-controlled strings, origins, screenshots, or actions. */
export const ReviewEvidenceSchema = z
  .object({
    schemaVersion: z.literal('1'),
    passwordField: z.boolean(),
    pageOrigin: z.enum(['APPROVED', 'UNAPPROVED']),
    formDestination: z.enum([
      'NONE',
      'SAME_ORIGIN',
      'APPROVED_EXTERNAL',
      'UNAPPROVED_EXTERNAL',
      'INVALID',
    ]),
    redirected: z.boolean(),
    downloadLinkCount: z.number().int().min(0).max(20),
    heuristicCategories: z.array(z.enum(THREAT_CATEGORIES)).max(5),
    collection: z.literal('STATIC_SCRIPTS_DISABLED'),
  })
  .strict();
export type ReviewEvidence = z.infer<typeof ReviewEvidenceSchema>;
export const EvidenceReviewSchema = z
  .object({
    verdict: z.enum(['SUSPICIOUS', 'UNDETERMINED']),
    rationale: z.string().min(1).max(400),
  })
  .strict();
export type EvidenceReview = z.infer<typeof EvidenceReviewSchema>;
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['SUSPICIOUS', 'UNDETERMINED'] },
    rationale: { type: 'string', minLength: 1, maxLength: 400 },
  },
  required: ['verdict', 'rationale'],
};

export function deriveReviewEvidence(
  input: InspectionObservation,
  approvedOrigins: readonly string[],
): ReviewEvidence {
  const observation = InspectionObservationSchema.parse(input);
  const page = new URL(observation.finalUrl).origin;
  const approved = new Set(approvedOrigins.map((value) => new URL(value).origin));
  let formDestination: ReviewEvidence['formDestination'] = 'NONE';
  if (observation.formAction !== null) {
    try {
      const destination = new URL(observation.formAction, observation.finalUrl);
      formDestination = !['http:', 'https:'].includes(destination.protocol)
        ? 'INVALID'
        : destination.origin === page
          ? 'SAME_ORIGIN'
          : approved.has(destination.origin)
            ? 'APPROVED_EXTERNAL'
            : 'UNAPPROVED_EXTERNAL';
    } catch {
      formDestination = 'INVALID';
    }
  }
  return ReviewEvidenceSchema.parse({
    schemaVersion: '1',
    passwordField: observation.passwordField,
    pageOrigin: approved.has(page) ? 'APPROVED' : 'UNAPPROVED',
    formDestination,
    redirected: observation.redirects.length > 0,
    downloadLinkCount: observation.downloadLinks?.length ?? 0,
    heuristicCategories: detectThreats(observation, approvedOrigins).map(
      (finding) => finding.category,
    ),
    collection: 'STATIC_SCRIPTS_DISABLED',
  });
}

export function serializeReviewRequest(evidence: ReviewEvidence): string {
  const checked = ReviewEvidenceSchema.parse(evidence);
  return (
    'Review the following bounded structural web inspection evidence. This is advisory only. ' +
    'Return SUSPICIOUS when the structural indicators justify concern; otherwise UNDETERMINED. ' +
    'No findings never establishes safety. An unapproved login or a heuristic match can be legitimate. ' +
    'Do not claim malicious intent, host containment, observed credential theft, or real-world accuracy. ' +
    'Do not suggest actions or execute tools. Give a short evidence-based rationale. ' +
    'Use only the provided categories and relationships; do not invent page content.\n' +
    JSON.stringify(checked)
  );
}
export interface ReviewTrace {
  model: string;
  reasoningEffort: 'medium';
  requestSha256: string;
  requestBytes: number;
  responseBytes: number;
  outcome: 'SUCCEEDED' | PlannerFailureCode;
  startedAt: string;
  invocationStartedAt: string | null;
  responseReceivedAt: string | null;
  validatedAt: string | null;
  returnedAt: string;
  setupMs: number | null;
  cliRoundTripMs: number | null;
  validationMs: number | null;
  totalMs: number;
}
export class CliAstraEvidenceReviewer {
  constructor(
    private readonly options: {
      executable?: string;
      timeoutMs?: number;
      runner?: CliRunner;
      onTrace?: (trace: ReviewTrace) => void;
    } = {},
  ) {}

  async review(evidence: ReviewEvidence): Promise<EvidenceReview> {
    const start = performance.now();
    const startedAt = new Date().toISOString();
    const input = serializeReviewRequest(evidence);
    const trace: ReviewTrace = {
      model: ASTRA_MODEL,
      reasoningEffort: 'medium',
      requestSha256: createHash('sha256').update(input).digest('hex'),
      requestBytes: Buffer.byteLength(input),
      responseBytes: 0,
      outcome: 'TRANSPORT_FAILED',
      startedAt,
      invocationStartedAt: null,
      responseReceivedAt: null,
      validatedAt: null,
      returnedAt: '',
      setupMs: null,
      cliRoundTripMs: null,
      validationMs: null,
      totalMs: 0,
    };
    let directory: string | undefined;
    try {
      const executable =
        this.options.executable ?? process.env.AIONGUARD_CODEX_PATH ?? DEFAULT_CODEX_PATH;
      const timeoutMs = this.options.timeoutMs ?? 90_000;
      if (
        !path.isAbsolute(executable) ||
        !Number.isSafeInteger(timeoutMs) ||
        timeoutMs < 1 ||
        timeoutMs > 120_000
      )
        throw new PlannerUnavailableError('NOT_AVAILABLE');
      directory = await mkdtemp(path.join(tmpdir(), 'aionguard-evidence-review-'));
      const schemaPath = path.join(directory, 'schema.json');
      const responsePath = path.join(directory, 'response.json');
      await writeFile(schemaPath, JSON.stringify(OUTPUT_SCHEMA), { mode: 0o600 });
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
        'model_reasoning_effort="medium"',
        '--model',
        ASTRA_MODEL,
        '--cd',
        directory,
        '--output-schema',
        schemaPath,
        '--output-last-message',
        responsePath,
        '--json',
        '-',
      ];
      const invocation = performance.now();
      trace.setupMs = invocation - start;
      trace.invocationStartedAt = new Date().toISOString();
      await (this.options.runner ?? runCliProcess)({
        executable,
        args,
        input,
        cwd: directory,
        timeoutMs,
      });
      const responseReceived = performance.now();
      trace.responseReceivedAt = new Date().toISOString();
      trace.cliRoundTripMs = responseReceived - invocation;
      const metadata = await lstat(responsePath);
      if (!metadata.isFile() || metadata.isSymbolicLink())
        throw new PlannerUnavailableError('INVALID_RESPONSE');
      if (metadata.size > 4_000) throw new PlannerUnavailableError('OUTPUT_LIMIT');
      const response = await readFile(responsePath, 'utf8');
      trace.responseBytes = Buffer.byteLength(response);
      let result: EvidenceReview;
      try {
        result = EvidenceReviewSchema.parse(JSON.parse(response));
      } catch {
        throw new PlannerUnavailableError('INVALID_RESPONSE');
      }
      trace.validatedAt = new Date().toISOString();
      trace.validationMs = performance.now() - responseReceived;
      trace.outcome = 'SUCCEEDED';
      return result;
    } catch (error) {
      const failure =
        error instanceof PlannerUnavailableError
          ? error
          : new PlannerUnavailableError('TRANSPORT_FAILED');
      trace.outcome = failure.code;
      throw failure;
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
      trace.returnedAt = new Date().toISOString();
      trace.totalMs = performance.now() - start;
      try {
        this.options.onTrace?.({ ...trace });
      } catch {
        /* observer cannot affect the verdict */
      }
    }
  }
}
