import { existsSync } from 'node:fs';
import { z } from 'zod';

export const ConfigSchema = z.object({
  AIONGUARD_CONTROLLED_CLICK_DEMO: z.enum(['true', 'false']).default('false'),
  AIONGUARD_PROVIDER: z.enum(['SOLARI', 'VERCEL']).default('SOLARI'),
  AIONGUARD_SOLARI_SESSION: z.enum(['WARM', 'FRESH']).default('WARM'),
  AIONGUARD_SOLARI_IDLE_MS: z.coerce.number().int().min(1000).max(240000).default(120000),
  AIONGUARD_SOLARI_MAX_AGE_MS: z.coerce.number().int().min(60000).max(240000).default(240000),
  AIONGUARD_SOLARI_MAX_INSPECTIONS: z.coerce.number().int().min(1).max(100).default(100),
  AIONGUARD_WORKFLOW: z.enum(['DETECTOR', 'SYNTHETIC']).default('DETECTOR'),
  AIONGUARD_MODE: z.enum(['LIVE', 'MOCK']).default('LIVE'),
  AIONGUARD_PORT: z.coerce.number().int().min(1024).max(65535).default(4317),
  AIONGUARD_CONTROLLER_TOKEN: z.string().min(32).optional(),
  AIONGUARD_ENTRY_TOKEN: z.string().min(32).optional(),
  ASTRA_CLI_PATH: z.string().default('/Applications/Codex.app/Contents/Resources/codex'),
  OPENAI_MODEL: z
    .string()
    .regex(/^[a-zA-Z0-9._-]+$/)
    .default('gpt-6-astra'),
  ASTRA_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(60000),
});
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  // dotenv-style configuration stays server-side and is never imported by Vite/UI.
  if (env === process.env) {
    if (existsSync('.env')) process.loadEnvFile('.env');
    const providerEnv =
      process.env.AIONGUARD_PROVIDER === 'VERCEL'
        ? process.env.AIONGUARD_VERCEL_ENV_PATH
        : process.env.AIONGUARD_SOLARI_ENV_PATH;
    if (providerEnv && existsSync(providerEnv)) process.loadEnvFile(providerEnv);
  }
  const nonempty = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  return ConfigSchema.parse(nonempty);
}
