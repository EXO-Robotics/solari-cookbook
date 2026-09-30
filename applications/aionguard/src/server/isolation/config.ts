import { z } from 'zod';
import {
  BROWSER_VERSION,
  normalizeFixtureTarget,
  registeredFixture,
  type RegisteredFixture,
} from './policy.ts';

export const SnapshotApprovalSchema = z
  .object({
    schemaVersion: z.literal(1),
    snapshotId: z.string().regex(/^snap_[A-Za-z0-9_-]+$/),
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
    buildProvenance: z
      .object({
        recipeSha256: z.string().regex(/^[a-f0-9]{64}$/),
        sourceTreeDirty: z.boolean(),
        blankBrowserVerified: z.literal(true),
      })
      .strict()
      .optional(),
    approvedAt: z.iso.datetime(),
    playwrightVersion: z.literal(BROWSER_VERSION),
    clean: z.literal(true),
    visitedContent: z.literal(false),
    credentialsIncluded: z.literal(false),
  })
  .strict();
export type SnapshotApproval = z.infer<typeof SnapshotApprovalSchema>;
export interface VercelInspectorConfig {
  fixture: RegisteredFixture;
  snapshot: SnapshotApproval;
  credentials: { token: string; teamId: string; projectId: string } | { oidcToken: string };
  region?: 'iad1';
  sandboxTimeoutMs?: number;
  navigationTimeoutMs?: number;
  commandTimeoutMs?: number;
  cleanupTimeoutMs?: number;
  maxConcurrent?: number;
}

export function validateConfig(config: VercelInspectorConfig): Required<VercelInspectorConfig> {
  const fixture = registeredFixture(
    config.fixture.url,
    config.fixture.identityProviderOrigins,
    'url',
  );
  if (
    fixture.url !== config.fixture.url ||
    config.fixture.id !== fixture.id ||
    JSON.stringify(fixture.navigationOrigins) !== JSON.stringify(config.fixture.navigationOrigins)
  )
    throw new Error('Fixture registry mismatch');
  const credentials = z
    .union([
      z
        .object({
          token: z.string().min(1),
          teamId: z.string().min(1),
          projectId: z.string().min(1),
        })
        .strict(),
      z.object({ oidcToken: z.string().min(1) }).strict(),
    ])
    .parse(config.credentials);
  const timing = z
    .object({
      sandboxTimeoutMs: z.number().int().min(30_000).max(180_000),
      navigationTimeoutMs: z.number().int().min(1_000).max(30_000),
      commandTimeoutMs: z.number().int().min(5_000).max(90_000),
      cleanupTimeoutMs: z.number().int().min(1_000).max(30_000),
      maxConcurrent: z.number().int().min(1).max(5),
    })
    .parse({
      sandboxTimeoutMs: config.sandboxTimeoutMs ?? 90_000,
      navigationTimeoutMs: config.navigationTimeoutMs ?? 15_000,
      commandTimeoutMs: config.commandTimeoutMs ?? 30_000,
      cleanupTimeoutMs: config.cleanupTimeoutMs ?? 15_000,
      maxConcurrent: config.maxConcurrent ?? 1,
    });
  if (
    timing.navigationTimeoutMs >= timing.commandTimeoutMs ||
    timing.commandTimeoutMs >= timing.sandboxTimeoutMs
  )
    throw new Error('Require navigation < command < VM deadlines');
  if (config.region && config.region !== 'iad1')
    throw new Error('Only the bounded iad1 region is configured');
  return {
    fixture,
    snapshot: SnapshotApprovalSchema.parse(config.snapshot),
    credentials,
    region: 'iad1',
    ...timing,
  };
}

/** The host explicitly supplies approval data; no account files or CLI tokens are scraped. */
export function inspectorConfigFromEnv(
  env: NodeJS.ProcessEnv,
  approval: unknown,
): VercelInspectorConfig | null {
  const snapshot = SnapshotApprovalSchema.safeParse(approval);
  if (
    !snapshot.success ||
    snapshot.data.snapshotId !== env.AIONGUARD_VERCEL_SNAPSHOT_ID ||
    (!env.AIONGUARD_FIXTURE_URL && !env.AIONGUARD_FIXTURE_ORIGIN)
  )
    return null;
  const credentials =
    env.VERCEL_TOKEN && env.VERCEL_TEAM_ID && env.VERCEL_PROJECT_ID
      ? { token: env.VERCEL_TOKEN, teamId: env.VERCEL_TEAM_ID, projectId: env.VERCEL_PROJECT_ID }
      : env.VERCEL_OIDC_TOKEN
        ? { oidcToken: env.VERCEL_OIDC_TOKEN }
        : null;
  if (!credentials) return null;
  try {
    const target = env.AIONGUARD_FIXTURE_URL
      ? normalizeFixtureTarget(env.AIONGUARD_FIXTURE_URL, 'url')
      : normalizeFixtureTarget(env.AIONGUARD_FIXTURE_ORIGIN!, 'origin');
    if (
      env.AIONGUARD_FIXTURE_ORIGIN &&
      normalizeFixtureTarget(env.AIONGUARD_FIXTURE_ORIGIN, 'origin').origin !== target.origin
    )
      throw new Error('Fixture URL and origin configuration conflict');
    return validateConfig({
      fixture: registeredFixture(
        target.url,
        (env.AIONGUARD_IDP_ORIGINS ?? '').split(',').filter(Boolean),
        'url',
      ),
      snapshot: snapshot.data,
      credentials,
      region: (env.AIONGUARD_VERCEL_REGION ?? 'iad1') as 'iad1',
      sandboxTimeoutMs: Number(env.AIONGUARD_SANDBOX_TIMEOUT_MS ?? 90_000),
      navigationTimeoutMs: Number(env.AIONGUARD_NAVIGATION_TIMEOUT_MS ?? 15_000),
      commandTimeoutMs: Number(env.AIONGUARD_COMMAND_TIMEOUT_MS ?? 30_000),
      cleanupTimeoutMs: Number(env.AIONGUARD_CLEANUP_TIMEOUT_MS ?? 15_000),
      maxConcurrent: Number(env.AIONGUARD_MAX_CONCURRENT_SANDBOXES ?? 1),
    });
  } catch {
    return null;
  }
}
