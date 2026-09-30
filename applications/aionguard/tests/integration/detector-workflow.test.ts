import { once } from 'node:events';
import { request as httpRequest, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ASSUMPTIONS, type InspectionResult, type Inspector } from '../../src/contracts/index.js';
import { CaseController } from '../../src/server/runtime/controller.js';
import { createMockInspector } from '../../src/server/isolation/index.js';
import { createHttpServer } from '../../src/server/http/server.js';
import { ProtectionLease } from '../../src/server/runtime/protection.js';

const authorization = { scenario: 'OWNED_FIXTURE_INSPECTION', assumptions: [], change: 'NONE' };
const synthetic = {
  scenario: 'SYNTHETIC_ASSUMED_COMPROMISE',
  assumptions: ASSUMPTIONS,
  change: 'jenkins.cli_enabled:true->false',
};
// Injected software results test the controller contract; they do not prove a live Solari run.
function setup(source: InspectionResult['source'] = 'SOLARI_SANDBOX') {
  const choose = vi.fn();
  const inspect = vi.fn(async (fixtureId: string) => {
    const result = await createMockInspector(source).inspect(fixtureId);
    return { ...result, mode: 'LIVE' as const };
  });
  const inspector: Inspector = { inspect };
  const controller = new CaseController({
    workflow: 'DETECTOR',
    inspectionSource: 'SOLARI_SANDBOX',
    inspector,
    planner: { choose },
    inspectionMode: 'LIVE',
    plannerMode: 'MOCK',
    approvedIdpOrigins: ['https://idp.acme.invalid'],
  });
  const run = controller.create().identity.runId;
  return { controller, run, choose, inspect };
}

describe('detector workflow separation', () => {
  it('requires the exact inspection-only authorization and does not broaden to synthetic authority', async () => {
    const { controller, run, inspect } = setup();
    await expect(controller.inspect(run, 'acme-login', 'unauthorized')).rejects.toThrow(
      'OPERATOR_AUTHORIZATION_REQUIRED',
    );
    for (const invalid of [
      synthetic,
      { ...authorization, assumptions: [ASSUMPTIONS[0]] },
      { ...authorization, change: synthetic.change },
      { ...authorization, arbitraryPermission: true },
    ]) {
      expect(() => controller.authorize(run, invalid)).toThrow();
    }
    expect(inspect).not.toHaveBeenCalled();
    const authorized = controller.authorize(run, authorization);
    expect(authorized.authorization).toMatchObject(authorization);
  });
  it('records Solari findings and stops without planning, synthetic observations, or changes', async () => {
    const { controller, run, choose } = setup();
    controller.authorize(run, authorization);
    const state = await controller.inspect(run, 'acme-login', 'detector', 'OPERATOR_DIRECT');
    expect(state.workflow).toBe('DETECTOR');
    expect(state.link.source).toBe('SOLARI_SANDBOX');
    expect(state.link.classification).toBe('SUSPICIOUS');
    expect(state.link.findings.map((finding) => finding.category)).toContain('CREDENTIAL_PHISHING');
    expect(state.execution).toBe('BLOCKED');
    expect(state.observations).toEqual([]);
    expect(state.assessments).toEqual([]);
    expect(state.brokerReceipts).toEqual([]);
    expect(state.change).toBeNull();
    expect(state.baseline).toBeNull();
    expect(state.budget.spent).toBe(0);
    expect(state.verification).toBe('NOT_REQUESTED');
    expect(
      state.events.some((event) =>
        ['PLANNER_DISPATCHED', 'SCENARIO_STARTED', 'CHANGE_APPLIED', 'NAVIGATION_HELD'].includes(
          event.type,
        ),
      ),
    ).toBe(false);
    expect(choose).not.toHaveBeenCalled();
    const receipt = controller.receipt(run);
    expect(receipt.snapshot.link.source).toBe('SOLARI_SANDBOX');
    expect(receipt.claims.endpointInterceptionVerified).toBe(false);
    expect(receipt.claims.consequenceDemonstrated).toBe(false);
  });
  it('rejects provider provenance mismatch without relabeling a Vercel result as Solari evidence', async () => {
    const { controller, run, choose } = setup('VERCEL_SANDBOX');
    controller.authorize(run, authorization);
    const state = await controller.inspect(run, 'acme-login', 'mismatched');
    expect(state.link.classification).toBe('INSPECTION_UNAVAILABLE');
    expect(state.link.failure).toBe('PROVIDER_UNAVAILABLE');
    expect(state.link.observation).toBeNull();
    expect(state.link.imagePath).toBeNull();
    expect(state.link.findings).toEqual([]);
    expect(state.observations).toEqual([]);
    expect(choose).not.toHaveBeenCalled();
  });
  it('rejects synthetic mutations even when invoked directly on the controller', async () => {
    const { controller, run, choose } = setup();
    controller.authorize(run, authorization);
    await controller.inspect(run, 'acme-login', 'inspect');
    for (const action of ['continue', 'harden', 'verify'] as const) {
      await expect(async () => controller[action](run, action, 0)).rejects.toThrow(
        'SYNTHETIC_WORKFLOW_DISABLED',
      );
    }
    expect(controller.snapshot(run).change).toBeNull();
    expect(controller.snapshot(run).observations).toEqual([]);
    expect(choose).not.toHaveBeenCalled();
  });
});

const token = 'detector_operator_'.padEnd(48, 'x');
const entryToken = 'detector_entry_'.padEnd(48, 'y');
const recoveryToken = 'detector_recovery_'.padEnd(48, 'z');
let server: Server | null = null;
afterEach(async () => {
  if (server) {
    const current = server;
    server = null;
    current.closeAllConnections();
    await new Promise<void>((resolve) => current.close(() => resolve()));
  }
});
async function httpSetup() {
  const result = setup();
  const protection = new ProtectionLease(() => result.controller.revokeEntry());
  server = createHttpServer({
    controller: result.controller,
    protection,
    token,
    entryToken,
    recoveryToken,
    mode: 'LIVE',
    workflow: 'DETECTOR',
    port: 4317,
    allowedExtensionOrigins: [],
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test socket');
  const send = (action: string, body: unknown, secret = token) =>
    new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: `/api/attempts/${result.run}/${action}`,
          method: 'POST',
          headers: {
            Host: '127.0.0.1:4317',
            Authorization: `Bearer ${secret}`,
            'Content-Type': 'application/json',
          },
        },
        (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode!));
        },
      );
      req.on('error', reject);
      req.end(JSON.stringify(body));
    });
  return { ...result, send };
}
describe('operator-only detector HTTP endpoint', () => {
  it('accepts only the operator token and exact revision and fixture contract', async () => {
    const { controller, run, send, inspect } = await httpSetup();
    controller.authorize(run, authorization);
    const command = { requestId: 'direct', revision: 0 };
    expect(await send('inspect', command, entryToken)).toBe(401);
    expect(await send('inspect', command, recoveryToken)).toBe(401);
    expect(await send('inspect', { ...command, url: 'https://arbitrary.invalid/' })).toBe(400);
    expect(await send('inspect', { ...command, fixtureId: 'other' })).toBe(400);
    expect(await send('inspect', { ...command, revision: 4 })).toBe(409);
    expect(inspect).not.toHaveBeenCalled();
    expect(await send('inspect', command)).toBe(200);
    expect(inspect).toHaveBeenCalledExactlyOnceWith('acme-login');
    expect(controller.receipt(run).claims.endpointInterceptionVerified).toBe(false);
  });
  it('rejects synthetic API mutations and leaves the detector result unchanged', async () => {
    const { controller, run, send, choose } = await httpSetup();
    controller.authorize(run, authorization);
    expect(await send('inspect', { requestId: 'inspect', revision: 0 })).toBe(200);
    const before = controller.snapshot(run);
    for (const action of ['continue', 'harden', 'verify']) {
      expect(await send(action, { requestId: action, revision: 0 })).toBe(403);
    }
    expect(controller.snapshot(run)).toEqual(before);
    expect(choose).not.toHaveBeenCalled();
  });
});
