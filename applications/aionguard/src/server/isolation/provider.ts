import { APIError, Sandbox, type NetworkPolicy } from '@vercel/sandbox';
import type { VercelInspectorConfig } from './config.ts';

export class IsolationError extends Error {
  constructor(
    readonly code:
      'PROVIDER_UNAVAILABLE' | 'CAPACITY' | 'NAVIGATION_DENIED' | 'TIMEOUT' | 'INVALID_EVIDENCE',
    readonly creationRejected = false,
  ) {
    super(code);
    this.name = 'IsolationError';
  }
}
export interface CreateInspectionVm {
  name: string;
  snapshotId: string;
  region: 'iad1';
  timeoutMs: number;
  networkPolicy: NetworkPolicy;
  credentials: VercelInspectorConfig['credentials'];
}
export interface InspectionVm {
  id: string;
  writeFiles(files: { path: string; content: string }[], signal: AbortSignal): Promise<void>;
  runWorker(timeoutMs: number, signal: AbortSignal): Promise<number>;
  readResult(maxBytes: number, signal: AbortSignal): Promise<Buffer>;
  stop(signal: AbortSignal): Promise<{ status: string }>;
  delete(signal: AbortSignal): Promise<void>;
}
export interface IsolationProvider {
  create(options: CreateInspectionVm, signal: AbortSignal): Promise<InspectionVm>;
}

/** Decode routing claims only; Vercel validates the token at its API boundary. */
export function sdkCredentials(credentials: VercelInspectorConfig['credentials']): {
  token: string;
  teamId: string;
  projectId: string;
} {
  if ('token' in credentials) return credentials;
  try {
    const payload = JSON.parse(
      Buffer.from(credentials.oidcToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
    );
    if (
      typeof payload.owner_id !== 'string' ||
      !payload.owner_id ||
      typeof payload.project_id !== 'string' ||
      !payload.project_id ||
      typeof payload.exp !== 'number' ||
      payload.exp * 1000 <= Date.now()
    )
      throw new Error();
    return {
      token: credentials.oidcToken,
      teamId: payload.owner_id,
      projectId: payload.project_id,
    };
  } catch {
    throw new IsolationError('PROVIDER_UNAVAILABLE', true);
  }
}

export const vercelProvider: IsolationProvider = {
  async create(options, signal) {
    let sandbox: Sandbox;
    try {
      sandbox = await Sandbox.create({
        ...sdkCredentials(options.credentials),
        name: options.name,
        source: { type: 'snapshot', snapshotId: options.snapshotId },
        region: options.region,
        resources: { vcpus: 2 },
        timeout: options.timeoutMs,
        persistent: false,
        networkPolicy: options.networkPolicy,
        env: {},
        ports: [],
        signal,
      });
    } catch (error) {
      if (error instanceof IsolationError) throw error;
      if (error instanceof APIError) {
        const status = error.response.status;
        // Definite authorization/validation/quota denials differ from ambiguous POST outcomes.
        const rejected = [400, 401, 403, 404, 422, 429].includes(status);
        throw new IsolationError(status === 429 ? 'CAPACITY' : 'PROVIDER_UNAVAILABLE', rejected);
      }
      throw new IsolationError(signal.aborted ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE');
    }
    return {
      id: sandbox.currentSession().sessionId,
      writeFiles: (files, operationSignal) =>
        sandbox.writeFiles(files, { signal: operationSignal }),
      async runWorker(timeoutMs, operationSignal) {
        // The live provider rejects IPv6 CIDRs in its subnet policy. Disable IPv6
        // inside this disposable guest before Chromium can process any content.
        const ipv6 = await sandbox.runCommand({
          cmd: 'sysctl',
          args: ['-w', 'net.ipv6.conf.all.disable_ipv6=1', 'net.ipv6.conf.default.disable_ipv6=1'],
          sudo: true,
          timeoutMs: 5_000,
          signal: operationSignal,
        });
        if (ipv6.exitCode !== 0) throw new IsolationError('PROVIDER_UNAVAILABLE');
        const command = await sandbox.runCommand({
          cmd: 'node',
          args: ['--max-old-space-size=192', '/vercel/sandbox/aionguard-worker.mjs'],
          cwd: '/vercel/sandbox',
          env: { PLAYWRIGHT_BROWSERS_PATH: '/vercel/sandbox/ms-playwright' },
          timeoutMs,
          signal: operationSignal,
        });
        return command.exitCode;
      },
      async readResult(maxBytes, operationSignal) {
        const stream = await sandbox.readFile(
          { path: '/vercel/sandbox/aionguard-result.json', cwd: '/vercel/sandbox' },
          { signal: operationSignal },
        );
        if (!stream) throw new IsolationError('INVALID_EVIDENCE');
        let size = 0;
        const chunks: Buffer[] = [];
        try {
          for await (const chunk of stream) {
            const bytes = Buffer.from(chunk);
            size += bytes.length;
            if (size > maxBytes) throw new IsolationError('INVALID_EVIDENCE');
            chunks.push(bytes);
          }
        } finally {
          if ('destroy' in stream && typeof stream.destroy === 'function') stream.destroy();
        }
        return Buffer.concat(chunks);
      },
      async stop(operationSignal) {
        const state = await sandbox.stop({ signal: operationSignal });
        return { status: state.status };
      },
      delete: (operationSignal) => sandbox.delete({ signal: operationSignal }),
    };
  },
};
