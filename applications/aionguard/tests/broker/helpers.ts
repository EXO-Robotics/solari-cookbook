import {
  ASSUMPTIONS,
  type ActionId,
  type InvestigationSession,
  type Observation,
  type BrokerRequest,
} from '../../src/contracts/index.ts';
import { ACTION_POLICY, canonicalAction } from '../../src/server/broker/catalog.ts';
export function session(): InvestigationSession {
  return {
    identity: {
      schemaVersion: '1.0.0',
      caseId: 'PR-014',
      runId: 'run',
      attemptId: 'attempt',
      ledgerId: 'ledger',
      revision: 0,
    },
    authorization: {
      id: 'auth',
      at: new Date().toISOString(),
      scenario: 'SYNTHETIC_ASSUMED_COMPROMISE',
      principal: 'Apprentice-07',
      assumptions: [...ASSUMPTIONS],
      change: 'jenkins.cli_enabled:true->false',
    },
    observations: [],
    receipts: [],
    budget: { total: 4, spent: 0, remaining: 4 },
    catalog: structuredClone(ACTION_POLICY) as InvestigationSession['catalog'],
  };
}
export function request(
  id = 'request',
  actionId: ActionId = 'INV-PRINCIPAL-STATUS',
): BrokerRequest {
  return {
    requestId: id,
    revision: 0,
    origin: 'ASTRA',
    actionId,
    target: canonicalAction(actionId).target,
    rationale: 'Resolve a visible missing prerequisite.',
  };
}
export function observation(id = 'obs'): Observation {
  return {
    id,
    runId: 'run',
    caseId: 'PR-014',
    revision: 0,
    subject: 'prod-admin-legacy',
    predicate: 'principal_status',
    value: 'DISABLED',
    domain: 'SYNTHETIC_ORGANIZATION',
    source: {
      kind: 'SYNTHETIC_COLLECTOR',
      reference: 'source',
      authority: 'AUTHORITATIVE',
      actionId: 'INV-PRINCIPAL-STATUS',
    },
    observedAt: new Date(Date.now() - 1000).toISOString(),
    validity: {
      current: true,
      validUntil: new Date(Date.now() + 60_000).toISOString(),
      scope: 'PR-014',
      completeness: 'COMPLETE',
      carriedFrom: null,
    },
  };
}
