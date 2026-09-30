import { afterEach, describe, expect, it, vi } from 'vitest';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { createHttpServer, type HttpOptions } from '../../src/server/http/server.js';
import { CaseController } from '../../src/server/runtime/controller.js';
import { createMockInspector } from '../../src/server/isolation/index.js';
import { MockPlanner } from '../../src/server/planner/index.js';
import { ASSUMPTIONS } from '../../src/contracts/index.js';
import { ProtectionLease } from '../../src/server/runtime/protection.js';
const token = 'operator_'.padEnd(48, 'x');
const entryToken = 'entry_'.padEnd(48, 'y');
const recoveryToken = 'recovery_'.padEnd(48, 'z');
let server: Server | null = null;
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
});
async function setup(
  mode: 'LIVE' | 'MOCK' = 'MOCK',
  allowedExtensionOrigins: string[] = [],
  sandbox?: HttpOptions['sandbox'],
) {
  const controller = new CaseController({
    inspector: createMockInspector(),
    planner: new MockPlanner(),
    inspectionMode: 'MOCK',
    plannerMode: 'MOCK',
    approvedIdpOrigins: [],
  });
  const protection = new ProtectionLease(() => controller.revokeEntry());
  server = createHttpServer({
    controller,
    token,
    entryToken,
    recoveryToken,
    protection,
    port: 4317,
    mode,
    allowedExtensionOrigins,
    sandbox,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const send = (
    path: string,
    {
      secret = token,
      method = 'GET',
      origin,
      host = '127.0.0.1:4317',
      body,
      type = 'application/json',
    }: {
      secret?: string;
      method?: string;
      origin?: string;
      host?: string;
      body?: unknown;
      type?: string;
    } = {},
  ) =>
    new Promise<{ status: number; body: any; headers: any }>((resolve) => {
      const req = httpRequest(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: {
            Host: host,
            Authorization: `Bearer ${secret}`,
            ...(origin ? { Origin: origin } : {}),
            'Content-Type': type,
          },
        },
        (response) => {
          let data = '';
          response.on('data', (chunk) => {
            data += chunk;
          });
          response.on('end', () =>
            resolve({
              status: response.statusCode!,
              body: JSON.parse(data || '{}'),
              headers: response.headers,
            }),
          );
        },
      );
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  return { controller, send, protection, port };
}
describe('local HTTP authority boundary', () => {
  it('keeps warm resource status and preparation operator-only with strict commands', async () => {
    const state = {
      state: 'READY' as const,
      sandboxId: 'solari-publichash',
      readyAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1000).toISOString(),
      inspectionCount: 0,
      cleanupUnresolved: 0,
      lastError: null,
    };
    const prepare = vi.fn(async () => {});
    const { send } = await setup('LIVE', [], { status: () => state, prepare });
    for (const secret of ['', entryToken, recoveryToken]) {
      expect((await send('/api/sandbox', { secret })).status).toBe(401);
      expect(
        (await send('/api/sandbox/prepare', { method: 'POST', body: {}, secret })).status,
      ).toBe(401);
    }
    expect((await send('/api/sandbox')).body).toEqual(state);
    expect(
      (
        await send('/api/sandbox/prepare', {
          method: 'POST',
          body: { url: 'https://untrusted.example' },
        })
      ).status,
    ).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
    expect((await send('/api/sandbox/prepare', { method: 'POST', body: {} })).status).toBe(202);
    expect(prepare).toHaveBeenCalledOnce();
  });

  it('returns preparation status without waiting for cold startup and sanitizes rejection', async () => {
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((_, fail) => {
      reject = fail;
    });
    const { send } = await setup('LIVE', [], {
      status: () => ({
        state: 'PREPARING',
        sandboxId: null,
        readyAt: null,
        expiresAt: null,
        inspectionCount: 0,
        cleanupUnresolved: 0,
        lastError: null,
      }),
      prepare: () => pending,
    });
    const response = await send('/api/sandbox/prepare', { method: 'POST', body: {} });
    expect(response.status).toBe(202);
    expect(response.body.state).toBe('PREPARING');
    reject(new Error('signed.secret-provider-error'));
    expect(JSON.stringify((await send('/api/sandbox')).body)).not.toContain('secret');
  });

  it('reports disabled warm sessions without allocating a resource', async () => {
    const { send } = await setup();
    expect((await send('/api/sandbox')).body).toMatchObject({ state: 'DISABLED', sandboxId: null });
    expect((await send('/api/sandbox/prepare', { method: 'POST', body: {} })).status).toBe(409);
  });

  it('rejects an accepted arm request whose body completes after shutdown starts', async () => {
    const { controller, protection, port } = await setup();
    const runId = controller.create().identity.runId;
    controller.authorize(runId, {
      scenario: 'SYNTHETIC_ASSUMED_COMPROMISE',
      assumptions: ASSUMPTIONS,
      change: 'jenkins.cli_enabled:true->false',
    });
    protection.heartbeat(true);
    const status = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/protection/arm',
          method: 'POST',
          headers: {
            Host: '127.0.0.1:4317',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
        (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode!));
        },
      );
      request.on('error', reject);
      server!.once('request', () => {
        protection.shutdown();
        request.end(JSON.stringify({ runId }));
      });
      request.flushHeaders();
    });
    expect(status).toBe(409);
    expect(protection.heartbeat(true)).toMatchObject({ armed: false, recoveryReady: false });
  });
  it('separates arm, heartbeat and emergency-release authority', async () => {
    const { send, controller } = await setup();
    const runId = controller.create().identity.runId;
    controller.authorize(runId, {
      scenario: 'SYNTHETIC_ASSUMED_COMPROMISE',
      assumptions: ASSUMPTIONS,
      change: 'jenkins.cli_enabled:true->false',
    });
    const post = (path: string, secret: string, body = {}) =>
      send(path, { method: 'POST', secret, body });
    expect((await post('/api/protection/arm', token, { runId })).status).toBe(409);
    expect((await post('/api/protection/heartbeat', entryToken, { ready: true })).status).toBe(401);
    expect((await post('/api/protection/heartbeat', token, { ready: true })).status).toBe(401);
    expect((await post('/api/protection/heartbeat', recoveryToken, { ready: true })).status).toBe(
      200,
    );
    expect((await post('/api/protection/arm', entryToken)).status).toBe(401);
    expect((await post('/api/protection/arm', recoveryToken)).status).toBe(401);
    expect((await post('/api/protection/arm', token, { runId })).body.armed).toBe(true);
    expect((await send('/api/protection', { secret: entryToken })).body.armed).toBe(true);
    expect((await post('/api/protection/disarm', recoveryToken)).body.armed).toBe(false);
    expect(
      (await post('/api/protection/heartbeat', recoveryToken, { ready: true })).body.armed,
    ).toBe(false);
    expect((await send('/api/attempts', { secret: recoveryToken })).status).toBe(401);
    expect(
      (await post('/api/protection/disarm', recoveryToken, { requestId: 'not-a-uuid' })).status,
    ).toBe(400);
    const release = (
      await post('/api/protection/disarm', recoveryToken, {
        requestId: '11111111-1111-4111-8111-111111111111',
      })
    ).body;
    expect(release.releaseRequestId).toBe('11111111-1111-4111-8111-111111111111');
    expect(
      (
        await post('/api/protection/extension-ack', recoveryToken, {
          requestId: '11111111-1111-4111-8111-111111111111',
          rulesRemoved: true,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await post('/api/protection/extension-ack', entryToken, {
          requestId: '22222222-2222-4222-8222-222222222222',
          rulesRemoved: true,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await post('/api/protection/extension-ack', entryToken, {
          requestId: '11111111-1111-4111-8111-111111111111',
          rulesRemoved: true,
        })
      ).body.lastExtensionAck.rulesRemoved,
    ).toBe(true);
    expect((await post('/api/protection/disarm', entryToken, { armed: true })).status).toBe(400);
  });
  it('requires operator authentication for reads and mutations; entry token has no full API authority', async () => {
    const { send } = await setup();
    expect((await send('/api/attempts', { secret: '' })).status).toBe(401);
    expect((await send('/api/attempts', { secret: entryToken })).status).toBe(401);
    expect((await send('/api/attempts', { method: 'POST', body: {} })).status).toBe(201);
    expect((await send('/api/attempts')).status).toBe(200);
  });
  it('rejects DNS rebinding Host and untrusted origins even with the token', async () => {
    const { send } = await setup();
    expect((await send('/api/attempts', { host: 'attacker.invalid:4317' })).status).toBe(403);
    expect((await send('/api/attempts', { origin: 'https://attacker.invalid' })).status).toBe(403);
    expect((await send('/api/attempts', { origin: 'null' })).status).toBe(403);
  });
  it.each([
    'safari-web-extension://C2EC0C1A-1111-4222-8333-ABCDEF012345',
    'chrome-extension://ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP',
  ])('normalizes only the configured extension identity: %s', async (configured) => {
    const { send } = await setup('MOCK', [configured]);
    const origin = configured.toLowerCase();
    const preflight = await send('/api/protection', { origin, method: 'OPTIONS', secret: '' });
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(origin);
    expect((await send('/api/protection', { origin, secret: entryToken })).status).toBe(200);
    expect((await send('/api/protection', { origin, secret: '' })).status).toBe(401);
    for (const denied of [
      'null',
      '*',
      'https://attacker.invalid',
      'safari-web-extension://C2EC0C1A-1111-4222-8333-ABCDEF012346',
      'chrome-extension://pppppppppppppppppppppppppppppppp',
      `${origin}.attacker.invalid`,
      `${origin}:4317`,
      `${origin}/`,
      `${origin}?query=1`,
    ]) {
      const response = await send('/api/protection', { origin: denied, method: 'OPTIONS' });
      expect(response.status).toBe(403);
      expect(response.headers).not.toHaveProperty('access-control-allow-origin');
    }
  });
  it.each([
    '*',
    'null',
    'https://attacker.invalid',
    'safari-web-extension://*',
    'safari-web-extension://C2EC0C1A-1111-4222-8333-ABCDEF012345/path',
    'chrome-extension://not-an-extension-id',
  ])('rejects invalid extension origin configuration: %s', async (origin) => {
    await expect(setup('MOCK', [origin])).rejects.toThrow(
      'Configure exact Safari or Chrome extension origins',
    );
  });
  it('does not authorize a scenario from the entry route or accept arbitrary destinations', async () => {
    const { send } = await setup();
    const payload = { fixtureId: 'acme-login', requestId: 'entry1' };
    expect(
      (await send('/api/entry', { method: 'POST', secret: token, body: payload })).status,
    ).toBe(401);
    expect(
      (await send('/api/entry', { method: 'POST', secret: entryToken, body: payload })).status,
    ).toBe(409);
    expect(
      (
        await send('/api/entry', {
          method: 'POST',
          secret: entryToken,
          body: { ...payload, url: 'https://arbitrary.invalid' },
        })
      ).status,
    ).toBe(400);
  });
  it('strict commands cannot mutate budget, truth or source modes', async () => {
    const { send } = await setup();
    expect((await send('/api/attempts', { method: 'POST', body: { budget: 1000 } })).status).toBe(
      400,
    );
    expect((await send('/api/attempts', { method: 'POST', body: { mode: 'LIVE' } })).status).toBe(
      400,
    );
    expect(
      (await send('/api/attempts', { method: 'POST', body: {}, type: 'text/plain' })).status,
    ).toBe(415);
    expect(
      (await send('/api/attempts', { method: 'POST', body: { huge: 'x'.repeat(9000) } })).status,
    ).toBe(413);
  });
  it('never exposes the mock direct entry in LIVE mode', async () => {
    const { controller, send } = await setup('LIVE');
    const run = controller.create().identity.runId;
    expect(
      (
        await send(`/api/attempts/${run}/software-check`, {
          method: 'POST',
          body: { requestId: 'request', revision: 0 },
        })
      ).status,
    ).toBe(403);
    const health = await send('/api/health', { secret: '' });
    expect(health.body).not.toHaveProperty('token');
    expect(health.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(health.headers['cache-control']).toBe('no-store');
  });
});
