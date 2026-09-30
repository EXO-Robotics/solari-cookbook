import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request, type Server } from 'node:http';
import { ControlledClickDemo } from '../../src/server/runtime/controlled-click.js';
import { CaseController } from '../../src/server/runtime/controller.js';
import { createHttpServer } from '../../src/server/http/server.js';
import { createMockInspector } from '../../src/server/isolation/index.js';
import { MockPlanner } from '../../src/server/planner/index.js';

const token = 'operator_'.padEnd(48, 'x');
const entryToken = 'entry_'.padEnd(48, 'y');
const origin = `chrome-extension://${'a'.repeat(32)}`;
const authorization = { scenario: 'OWNED_FIXTURE_INSPECTION', assumptions: [], change: 'NONE' };

// Injected LIVE-shaped software evidence exercises authority contracts, not live containment.
function fixture() {
  const inspect = vi.fn(async (fixtureId: string) => ({
    ...(await createMockInspector('SOLARI_SANDBOX').inspect(fixtureId)),
    mode: 'LIVE' as const,
  }));
  const controller = new CaseController({
    workflow: 'DETECTOR',
    inspectionSource: 'SOLARI_SANDBOX',
    inspector: { inspect },
    planner: new MockPlanner(),
    inspectionMode: 'LIVE',
    plannerMode: 'MOCK',
    approvedIdpOrigins: ['https://idp.acme.invalid'],
  });
  const runId = controller.create().identity.runId;
  const authorize = () => controller.authorize(runId, authorization);
  return { controller, inspect, runId, authorize };
}

describe('controlled click one-case admission', () => {
  it('requires an authorized ready detector case and bounds duration', () => {
    const f = fixture();
    const demo = new ControlledClickDemo(f.controller);
    expect(() => demo.arm(f.runId)).toThrow('AUTHORIZED_READY_CASE_REQUIRED');
    f.authorize();
    for (const duration of [0, 999, 120001, 1000.5, NaN])
      expect(() => demo.arm(f.runId, duration)).toThrow('INVALID_DEMO_DURATION');
    demo.arm(f.runId);
    expect(() => demo.arm(f.runId)).toThrow('DEMO_ALREADY_ARMED');
    expect(f.inspect).not.toHaveBeenCalled();
  });

  it('expires on the monotonic clock, independent of wall-clock rollback', () => {
    const f = fixture();
    f.authorize();
    let now = 0,
      wall = 1000000;
    const demo = new ControlledClickDemo(
      f.controller,
      () => now,
      () => wall,
    );
    expect(demo.arm(f.runId, 1000).expiresAt).toBe(1001000);
    now = 1000;
    wall = 0;
    expect(() => demo.entry('acme-login', randomUUID())).toThrow('DEMO_NOT_ARMED');
    expect(f.inspect).not.toHaveBeenCalled();
  });

  it('consumes admission before async work and replays only the admitted request', async () => {
    const f = fixture();
    f.authorize();
    const demo = new ControlledClickDemo(f.controller);
    demo.arm(f.runId);
    const requestId = randomUUID();
    expect(demo.entry('acme-login', requestId)).toEqual({ runId: f.runId });
    expect(demo.entry('acme-login', requestId)).toEqual({ runId: f.runId });
    expect(() => demo.entry('acme-login', randomUUID())).toThrow('DEMO_NOT_ARMED');
    await vi.waitFor(() => expect(demo.status(requestId).state).toBe('COMPLETE'));
    expect(f.inspect).toHaveBeenCalledTimes(1);
    expect(f.controller.snapshot(f.runId).inspectionTrigger).toBe('CHROME_HANDOFF');
    expect(demo.status(requestId)).toMatchObject({ decision: 'BLOCK', runId: f.runId });
    expect(() => f.controller.entry('acme-login', randomUUID())).toThrow(
      'OPERATOR_AUTHORIZATION_REQUIRED',
    );
  });

  it('rejects fixture substitution without consuming the valid lease', () => {
    const f = fixture();
    f.authorize();
    const demo = new ControlledClickDemo(f.controller);
    demo.arm(f.runId);
    expect(() => demo.entry('https://arbitrary.invalid', randomUUID())).toThrow(
      'UNREGISTERED_FIXTURE',
    );
    expect(demo.entry('acme-login', randomUUID())).toEqual({ runId: f.runId });
  });

  it('disarm and shutdown fence new admission, including replay after shutdown', () => {
    const f = fixture();
    f.authorize();
    const demo = new ControlledClickDemo(f.controller);
    demo.arm(f.runId);
    demo.disarm();
    expect(() => demo.entry('acme-login', randomUUID())).toThrow('DEMO_NOT_ARMED');
    demo.arm(f.runId);
    const requestId = randomUUID();
    demo.entry('acme-login', requestId);
    demo.close();
    expect(() => demo.entry('acme-login', requestId)).toThrow('CONTROLLER_STOPPING');
    expect(() => demo.arm(f.runId)).toThrow('CONTROLLER_STOPPING');
  });

  it('keeps provider failure held for review and omits raw provider errors', async () => {
    const f = fixture();
    f.authorize();
    f.inspect.mockRejectedValueOnce(new Error('secret-provider-capability'));
    const demo = new ControlledClickDemo(f.controller);
    demo.arm(f.runId);
    const requestId = randomUUID();
    demo.entry('acme-login', requestId);
    await vi.waitFor(() => expect(demo.status(requestId).state).toBe('COMPLETE'));
    expect(demo.status(requestId)).toMatchObject({
      decision: 'REVIEW',
      classification: 'INSPECTION_UNAVAILABLE',
    });
    expect(JSON.stringify(demo.status(requestId))).not.toContain('secret-provider-capability');
  });
});

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }),
  );
});

async function httpFixture(enabled = true) {
  const f = fixture();
  const server = createHttpServer({
    controller: f.controller,
    token,
    entryToken,
    port: 4317,
    mode: 'LIVE',
    workflow: 'DETECTOR',
    controlledClickDemo: enabled,
    allowedExtensionOrigins: [origin],
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test socket missing');
  const send = (
    path: string,
    options: {
      secret?: string;
      method?: string;
      origin?: string;
      body?: unknown;
      host?: string;
    } = {},
  ) =>
    new Promise<{ status: number; body: any }>((resolve, reject) => {
      const req = request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path,
          method: options.method ?? 'GET',
          headers: {
            Host: options.host ?? '127.0.0.1:4317',
            Authorization: `Bearer ${options.secret ?? token}`,
            'Content-Type': 'application/json',
            ...(options.origin ? { Origin: options.origin } : {}),
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(body) }));
        },
      );
      req.on('error', reject);
      req.end(options.body === undefined ? undefined : JSON.stringify(options.body));
    });
  const arm = () => send('/api/controlled-click/arm', { method: 'POST', body: { runId: f.runId } });
  const entry = (requestId = randomUUID()) =>
    send('/api/controlled-click/entry', {
      method: 'POST',
      secret: entryToken,
      origin,
      body: { fixtureId: 'acme-login', requestId },
    });
  return { ...f, send, arm, entry };
}

describe('controlled click HTTP boundaries', () => {
  it('is opt-in and requires one exact Chrome origin and detector workflow', async () => {
    const f = await httpFixture(false);
    expect((await f.arm()).status).toBe(404);
    const base = {
      controller: f.controller,
      token,
      entryToken,
      port: 4317,
      mode: 'LIVE' as const,
      controlledClickDemo: true,
    };
    for (const allowedExtensionOrigins of [[], [origin, `chrome-extension://${'b'.repeat(32)}`]])
      expect(() =>
        createHttpServer({ ...base, workflow: 'DETECTOR', allowedExtensionOrigins }),
      ).toThrow();
    expect(() =>
      createHttpServer({ ...base, workflow: 'SYNTHETIC', allowedExtensionOrigins: [origin] }),
    ).toThrow();
  });

  it('requires operator arming and preserves Safari recovery requirements', async () => {
    const f = await httpFixture();
    expect((await f.arm()).status).toBe(409);
    f.authorize();
    expect(
      (
        await f.send('/api/controlled-click/arm', {
          method: 'POST',
          secret: entryToken,
          origin,
          body: { runId: f.runId },
        })
      ).status,
    ).toBe(401);
    expect((await f.entry()).status).toBe(409);
    expect((await f.arm()).status).toBe(200);
    expect(
      (await f.send('/api/protection/arm', { method: 'POST', body: { runId: f.runId } })).body
        .error,
    ).toBe('KEYBOARD_RECOVERY_REQUIRED');
  });

  it('requires both entry token and exact extension origin; denies host and schema substitution', async () => {
    const f = await httpFixture();
    f.authorize();
    await f.arm();
    const base = {
      method: 'POST',
      secret: entryToken,
      origin,
      body: { fixtureId: 'acme-login', requestId: randomUUID() },
    };
    for (const wrongOrigin of [
      undefined,
      'http://127.0.0.1:4317',
      `chrome-extension://${'b'.repeat(32)}`,
      'null',
    ])
      expect(
        (await f.send('/api/controlled-click/entry', { ...base, origin: wrongOrigin })).status,
      ).toBe(403);
    expect((await f.send('/api/controlled-click/entry', { ...base, secret: token })).status).toBe(
      401,
    );
    expect(
      (await f.send('/api/controlled-click/entry', { ...base, host: 'attacker.invalid' })).status,
    ).toBe(403);
    for (const body of [
      { ...base.body, url: 'https://arbitrary.invalid' },
      { ...base.body, fixtureId: 'elsewhere' },
      { ...base.body, requestId: 'not-uuid' },
    ])
      expect((await f.send('/api/controlled-click/entry', { ...base, body })).status).toBe(400);
    expect(f.inspect).not.toHaveBeenCalled();
    expect((await f.entry()).status).toBe(202);
  });

  it('limits status to a known request and minimal result; entry cannot read operator evidence', async () => {
    const f = await httpFixture();
    f.authorize();
    await f.arm();
    const requestId = randomUUID();
    const responses = await Promise.all([f.entry(requestId), f.entry(randomUUID())]);
    expect(responses.map((r) => r.status).sort()).toEqual([202, 409]);
    expect((await f.entry(requestId)).status).toBe(202);
    const access = { secret: entryToken, origin };
    const path = '/api/controlled-click/status';
    const statusAccess = { ...access, method: 'POST', body: { requestId } };
    await vi.waitFor(async () =>
      expect((await f.send(path, statusAccess)).body.state).toBe('COMPLETE'),
    );
    const status = await f.send(path, statusAccess);
    expect(Object.keys(status.body).sort()).toEqual(
      ['state', 'requestId', 'runId', 'classification', 'execution', 'decision', 'cleanup'].sort(),
    );
    expect(status.body.decision).toBe('BLOCK');
    expect(f.inspect).toHaveBeenCalledTimes(1);
    expect((await f.send(path, { ...statusAccess, secret: token })).status).toBe(401);
    expect((await f.send(path, { ...statusAccess, origin: undefined })).status).toBe(403);
    expect((await f.send(path, { ...statusAccess, body: {} })).status).toBe(400);
    expect(
      (await f.send(path, { ...statusAccess, body: { requestId: randomUUID() } })).status,
    ).toBe(404);
    expect(
      (
        await f.send(path, {
          ...statusAccess,
          body: { requestId, url: 'https://arbitrary.invalid' },
        })
      ).status,
    ).toBe(400);
    expect((await f.send(path + '?requestId=' + requestId, statusAccess)).status).toBe(400);
    expect((await f.send(path, access)).status).toBe(404);
    for (const route of [
      '/api/attempts',
      `/api/attempts/${f.runId}`,
      `/api/attempts/${f.runId}/image`,
      `/api/attempts/${f.runId}/receipt`,
    ])
      expect((await f.send(route, access)).status).toBe(401);
    expect(
      (await f.send('/api/controlled-click/disarm', { ...access, method: 'POST', body: {} }))
        .status,
    ).toBe(401);
  });
});
