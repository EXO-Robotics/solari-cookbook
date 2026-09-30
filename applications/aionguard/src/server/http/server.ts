import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { z } from 'zod';
import {
  AuthorizeCommandSchema,
  ContinueCommandSchema,
  CreateAttemptCommandSchema,
  IdSchema,
  WarmPoolStatusSchema,
  type WarmPoolStatus,
} from '../../contracts/index.js';
import { CaseController, CommandError } from '../runtime/controller.js';
import { ControlledClickDemo } from '../runtime/controlled-click.js';
import { ProtectionLease } from '../runtime/protection.js';

export interface HttpOptions {
  controller: CaseController;
  token: string;
  entryToken: string;
  port: number;
  staticDir?: string;
  allowedExtensionOrigins?: string[];
  mode: 'LIVE' | 'MOCK';
  workflow?: 'DETECTOR' | 'SYNTHETIC';
  protection?: ProtectionLease;
  recoveryToken?: string;
  controlledClickDemo?: boolean;
  sandbox?: { status(): WarmPoolStatus; prepare(): Promise<void> };
}
const EntrySchema = z.object({ fixtureId: z.literal('acme-login'), requestId: IdSchema }).strict();
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function normalizedExtensionOrigin(origin: string): string | null {
  // Safari's settings can display an uppercase UUID while its background sends
  // lowercase. Normalize only complete extension origins, never URL paths or
  // arbitrary hosts, and keep every configured extension identity explicit.
  const safari =
    /^safari-web-extension:\/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const chrome = /^chrome-extension:\/\/[a-p]{32}$/i;
  return safari.test(origin) || chrome.test(origin) ? origin.toLowerCase() : null;
}

export function createHttpServer(options: HttpOptions) {
  if (options.token.length < 32)
    throw new Error('Controller token must contain at least 32 characters');
  if (options.entryToken.length < 32 || options.entryToken === options.token)
    throw new Error('Entry token must be distinct and at least 32 characters');
  if (
    options.recoveryToken &&
    (options.recoveryToken.length < 32 ||
      [options.token, options.entryToken].includes(options.recoveryToken))
  )
    throw new Error('Recovery token must be distinct and at least 32 characters');
  const protection =
    options.protection ?? new ProtectionLease(() => options.controller.revokeEntry());
  const hosts = new Set([`127.0.0.1:${options.port}`, `localhost:${options.port}`]);
  const origins = new Set([
    `http://127.0.0.1:${options.port}`,
    `http://localhost:${options.port}`,
    'http://127.0.0.1:5173',
    ...(options.allowedExtensionOrigins ?? []).map((origin) => {
      const normalized = normalizedExtensionOrigin(origin);
      if (!normalized) throw new Error('Configure exact Safari or Chrome extension origins');
      return normalized;
    }),
  ]);
  const chromeOrigins = (options.allowedExtensionOrigins ?? [])
    .map(normalizedExtensionOrigin)
    .filter((value): value is string => !!value?.startsWith('chrome-extension://'));
  if (
    options.controlledClickDemo &&
    (options.workflow !== 'DETECTOR' || chromeOrigins.length !== 1)
  )
    throw new Error(
      'Controlled click demo requires detector mode and exactly one Chrome extension origin',
    );
  const controlledClick = options.controlledClickDemo
    ? new ControlledClickDemo(options.controller)
    : null;
  const server = createServer(async (req, res) => {
    securityHeaders(res);
    try {
      if (!hosts.has(req.headers.host ?? '')) throw new CommandError('HOST_DENIED', 403);
      const origin = req.headers.origin;
      if (origin && !origins.has(normalizedExtensionOrigin(origin) ?? origin))
        throw new CommandError('ORIGIN_DENIED', 403);
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${options.port}`);
      if (req.method === 'OPTIONS') {
        if (!origin) throw new CommandError('ORIGIN_REQUIRED', 403);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.writeHead(204).end();
        return;
      }
      if (url.pathname === '/api/health' && req.method === 'GET') {
        json(res, 200, {
          status: 'ready',
          mode: options.mode,
          workflow: options.workflow ?? 'SYNTHETIC',
          liveAcceptance: 'REQUIRES_MEASUREMENT',
          version: '0.1.0',
        });
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname.startsWith('/api/controlled-click/')) {
          if (!controlledClick) throw new CommandError('NOT_FOUND', 404);
          if (url.pathname === '/api/controlled-click/arm' && req.method === 'POST') {
            if (!authenticate(req, options.token))
              throw new CommandError('AUTHENTICATION_REQUIRED', 401);
            const command = z
              .object({
                runId: IdSchema,
                durationMs: z.number().int().min(1000).max(120000).optional(),
              })
              .strict()
              .parse(await body(req));
            json(res, 200, controlledClick.arm(command.runId, command.durationMs));
            return;
          }
          if (url.pathname === '/api/controlled-click/disarm' && req.method === 'POST') {
            if (!authenticate(req, options.token))
              throw new CommandError('AUTHENTICATION_REQUIRED', 401);
            z.object({})
              .strict()
              .parse(await body(req));
            json(res, 200, controlledClick.disarm());
            return;
          }
          if (!origin || normalizedExtensionOrigin(origin) !== chromeOrigins[0])
            throw new CommandError('CHROME_ORIGIN_REQUIRED', 403);
          if (!authenticate(req, options.entryToken))
            throw new CommandError('AUTHENTICATION_REQUIRED', 401);
          if (url.pathname === '/api/controlled-click/entry' && req.method === 'POST') {
            const command = z
              .object({ fixtureId: z.literal('acme-login'), requestId: z.uuid() })
              .strict()
              .parse(await body(req));
            json(res, 202, controlledClick.entry(command.fixtureId, command.requestId));
            return;
          }
          if (url.pathname === '/api/controlled-click/status' && req.method === 'POST') {
            if (url.search) throw new CommandError('INVALID_COMMAND', 400);
            const { requestId } = z
              .object({ requestId: z.uuid() })
              .strict()
              .parse(await body(req));
            json(res, 200, controlledClick.status(requestId));
            return;
          }
          throw new CommandError('NOT_FOUND', 404);
        }
        if (url.pathname.startsWith('/api/protection')) {
          const operator = authenticate(req, options.token);
          const entry = authenticate(req, options.entryToken);
          const recovery = !!options.recoveryToken && authenticate(req, options.recoveryToken);
          if (req.method === 'GET' && url.pathname === '/api/protection') {
            if (!operator && !entry && !recovery)
              throw new CommandError('AUTHENTICATION_REQUIRED', 401);
            json(res, 200, protection.status());
            return;
          }
          if (req.method === 'POST' && url.pathname === '/api/protection/heartbeat') {
            if (!recovery) throw new CommandError('AUTHENTICATION_REQUIRED', 401);
            const command = z
              .object({ ready: z.boolean() })
              .strict()
              .parse(await body(req));
            json(res, 200, protection.heartbeat(command.ready));
            return;
          }
          if (req.method === 'POST' && url.pathname === '/api/protection/disarm') {
            if (!operator && !entry && !recovery)
              throw new CommandError('AUTHENTICATION_REQUIRED', 401);
            const command = z
              .object({ requestId: z.uuid().optional() })
              .strict()
              .parse(await body(req));
            protection.disarm('EMERGENCY_RELEASE', command.requestId);
            json(res, 200, protection.status());
            return;
          }
          if (req.method === 'POST' && url.pathname === '/api/protection/extension-ack') {
            if (!entry) throw new CommandError('AUTHENTICATION_REQUIRED', 401);
            const command = z
              .object({ requestId: z.uuid(), rulesRemoved: z.boolean() })
              .strict()
              .parse(await body(req));
            json(
              res,
              200,
              protection.acknowledgeExtension(command.requestId, command.rulesRemoved),
            );
            return;
          }
          if (req.method === 'POST' && url.pathname === '/api/protection/arm') {
            if (!operator) throw new CommandError('AUTHENTICATION_REQUIRED', 401);
            const command = z
              .object({
                runId: IdSchema,
                durationMs: z.number().int().min(1000).max(300000).optional(),
              })
              .strict()
              .parse(await body(req));
            if (!protection.status().recoveryReady)
              throw new CommandError('KEYBOARD_RECOVERY_REQUIRED');
            options.controller.armEntry(command.runId);
            json(res, 200, protection.arm(command.durationMs));
            return;
          }
          throw new CommandError('NOT_FOUND', 404);
        }
        const expectedToken = url.pathname === '/api/entry' ? options.entryToken : options.token;
        if (!authenticate(req, expectedToken))
          throw new CommandError('AUTHENTICATION_REQUIRED', 401);
        if (req.method === 'GET' && url.pathname === '/api/sandbox') {
          json(
            res,
            200,
            WarmPoolStatusSchema.parse(
              options.sandbox?.status() ?? {
                state: 'DISABLED',
                sandboxId: null,
                readyAt: null,
                expiresAt: null,
                inspectionCount: 0,
                cleanupUnresolved: 0,
                lastError: null,
              },
            ),
          );
          return;
        }
        if (req.method === 'POST' && url.pathname === '/api/sandbox/prepare') {
          z.object({})
            .strict()
            .parse(await body(req));
          if (!options.sandbox) throw new CommandError('WARM_SANDBOX_DISABLED', 409);
          void options.sandbox.prepare().catch(() => {
            // The inspector records safe failure codes in its polled status.
          });
          json(res, 202, WarmPoolStatusSchema.parse(options.sandbox.status()));
          return;
        }
        if (req.method === 'GET' && url.pathname === '/api/attempts') {
          json(res, 200, options.controller.list());
          return;
        }
        if (req.method === 'POST' && url.pathname === '/api/attempts') {
          const command = CreateAttemptCommandSchema.parse(await body(req));
          json(res, 201, options.controller.create(command.variant));
          return;
        }
        if (req.method === 'POST' && url.pathname === '/api/entry') {
          const command = EntrySchema.parse(await body(req));
          if (!protection.status().armed) throw new CommandError('PROTECTION_NOT_ARMED');
          const entry = options.controller.entry(command.fixtureId, command.requestId);
          void entry.completion.catch(() => {
            /* Controller records provider failures; no raw subprocess errors enter HTTP. */
          });
          json(res, 202, { runId: entry.runId });
          return;
        }
        const route =
          /^\/api\/attempts\/([a-zA-Z0-9_-]+)(?:\/(authorize|continue|harden|verify|receipt|image|comparison|software-check|inspect))?$/.exec(
            url.pathname,
          );
        if (!route?.[1]) throw new CommandError('NOT_FOUND', 404);
        const run = route[1];
        const action = route[2];
        if (req.method === 'GET' && !action) {
          json(res, 200, options.controller.snapshot(run));
          return;
        }
        if (req.method === 'GET' && action === 'comparison') {
          json(res, 200, options.controller.comparison(run));
          return;
        }
        if (req.method === 'GET' && action === 'receipt') {
          res.setHeader('Content-Disposition', `attachment; filename="aionguard-${run}.json"`);
          json(res, 200, options.controller.receipt(run));
          return;
        }
        if (req.method === 'GET' && action === 'image') {
          res.setHeader('Content-Type', 'image/png');
          res.writeHead(200).end(options.controller.image(run));
          return;
        }
        if (req.method !== 'POST') throw new CommandError('METHOD_NOT_ALLOWED', 405);
        const payload = await body(req);
        if (action === 'authorize') {
          json(res, 200, options.controller.authorize(run, AuthorizeCommandSchema.parse(payload)));
          return;
        }
        const command = ContinueCommandSchema.parse(payload);
        if (action === 'inspect') {
          if (options.workflow !== 'DETECTOR')
            throw new CommandError('DETECTOR_WORKFLOW_REQUIRED', 403);
          if (command.revision !== options.controller.snapshot(run).identity.revision)
            throw new CommandError('STALE_REVISION');
          json(
            res,
            200,
            await options.controller.inspect(
              run,
              'acme-login',
              command.requestId,
              'OPERATOR_DIRECT',
            ),
          );
          return;
        }
        if (
          options.workflow === 'DETECTOR' &&
          ['continue', 'harden', 'verify'].includes(action ?? '')
        )
          throw new CommandError('SYNTHETIC_WORKFLOW_DISABLED', 403);
        if (action === 'software-check') {
          if (options.mode !== 'MOCK')
            throw new CommandError('SOFTWARE_CHECK_REQUIRES_MOCK_MODE', 403);
          json(
            res,
            200,
            await options.controller.inspect(
              run,
              'acme-login',
              command.requestId,
              'OPERATOR_DIRECT',
            ),
          );
          return;
        }
        if (action === 'continue') {
          json(
            res,
            200,
            await options.controller.continue(run, command.requestId, command.revision),
          );
          return;
        }
        if (action === 'harden') {
          json(res, 200, await options.controller.harden(run, command.requestId, command.revision));
          return;
        }
        if (action === 'verify') {
          json(res, 200, await options.controller.verify(run, command.requestId, command.revision));
          return;
        }
        throw new CommandError('NOT_FOUND', 404);
      }
      if (req.method !== 'GET') throw new CommandError('METHOD_NOT_ALLOWED', 405);
      if (!options.staticDir) {
        json(res, 404, { error: 'UI_BUILD_REQUIRED' });
        return;
      }
      const relative = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const base = resolve(options.staticDir);
      const target = resolve(base, `.${relative}`);
      if (!target.startsWith(base + sep)) throw new CommandError('NOT_FOUND', 404);
      let data: Buffer;
      try {
        data = await readFile(target);
      } catch {
        throw new CommandError('NOT_FOUND', 404);
      }
      res.setHeader('Content-Type', mime[extname(target)] ?? 'application/octet-stream');
      res.writeHead(200).end(data);
    } catch (error) {
      if (error instanceof z.ZodError) json(res, 400, { error: 'INVALID_COMMAND' });
      else if (error instanceof CommandError) json(res, error.status, { error: error.code });
      else json(res, 500, { error: 'INTERNAL_ERROR' });
    }
  });
  const close = server.close.bind(server);
  server.close = (callback) => {
    controlledClick?.close();
    return close(callback);
  };
  return server;
}
function authenticate(req: IncomingMessage, token: string): boolean {
  const value = req.headers.authorization ?? '';
  const expected = Buffer.from(`Bearer ${token}`);
  const supplied = Buffer.from(value);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
async function body(req: IncomingMessage): Promise<unknown> {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json')
    throw new CommandError('JSON_REQUIRED', 415);
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 8192) throw new CommandError('REQUEST_TOO_LARGE', 413);
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new CommandError('INVALID_JSON', 400);
  }
}
function json(res: ServerResponse, status: number, value: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.writeHead(status).end(JSON.stringify(value));
}
function securityHeaders(res: ServerResponse): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
}
