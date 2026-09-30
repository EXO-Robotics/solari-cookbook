import {
  AuthorizationSchema,
  BrokerRequestSchema,
  CaseIdentitySchema,
  BudgetSchema,
  ObservationSchema,
  type BrokerReceipt,
  type BrokerRequest,
  type Collector,
  type InvestigationSession,
} from '../../contracts/index.ts';
import { canonicalAction, permitsObservation } from './catalog.ts';

export function createBroker(session: InvestigationSession, collector: Collector) {
  const pending = new Map<string, { fingerprint: string; promise: Promise<BrokerReceipt> }>();
  let invalidSequence = 0;
  const seenIds = new Set(session.receipts.map((r) => r.requestId));

  function receipt(
    request: BrokerRequest,
    reason: BrokerReceipt['reason'],
    cost = 0,
    before = session.budget.remaining,
    observationIds: string[] = [],
  ): BrokerReceipt {
    const result: BrokerReceipt = {
      requestId: request.requestId,
      revision: request.revision,
      origin: request.origin,
      actionId: request.actionId,
      target: request.target,
      accepted: reason === 'COLLECTED' || reason === 'COLLECTION_FAILED',
      reason,
      cost,
      budgetBefore: before,
      budgetAfter: before - cost,
      observationIds,
      at: new Date().toISOString(),
    };
    session.receipts.push(structuredClone(result));
    return result;
  }

  async function dispatch(request: BrokerRequest): Promise<BrokerReceipt> {
    if (
      !CaseIdentitySchema.safeParse(session.identity).success ||
      !BudgetSchema.safeParse(session.budget).success
    )
      return receipt(request, 'INELIGIBLE');
    const authorization = AuthorizationSchema.safeParse(session.authorization);
    if (
      !authorization.success ||
      new Set(authorization.data.assumptions).size !== 3 ||
      Date.parse(authorization.data.at) > Date.now()
    )
      return receipt(request, 'UNAUTHORIZED');
    if (request.revision !== session.identity.revision) return receipt(request, 'STALE_REVISION');
    const policy = canonicalAction(request.actionId);
    const catalogMatches = session.catalog.filter((a) => a.id === request.actionId);
    if (catalogMatches.length !== 1) return receipt(request, 'INELIGIBLE');
    const advertised = catalogMatches[0]!;
    if (
      request.target !== policy.target ||
      advertised.target !== policy.target ||
      advertised.cost !== policy.cost ||
      JSON.stringify(advertised.coverage) !== JSON.stringify(policy.coverage) ||
      JSON.stringify(advertised.hypotheses) !== JSON.stringify(policy.hypotheses)
    )
      return receipt(request, 'INELIGIBLE');
    if (
      request.origin === 'OPERATOR_VERIFICATION'
        ? request.revision < 1 || request.actionId !== 'INV-JENKINS-CLI'
        : request.revision !== 0
    )
      return receipt(request, 'INELIGIBLE');
    if (session.budget.remaining < policy.cost) return receipt(request, 'INSUFFICIENT_BUDGET');
    const identity = Object.freeze(structuredClone(session.identity));
    const before = session.budget.remaining;
    // No await precedes this reservation. Independent concurrent requests share this ledger.
    session.budget.spent += policy.cost;
    session.budget.remaining -= policy.cost;
    const action = {
      ...policy,
      sourceCurrent: advertised.sourceCurrent,
      sourceComplete: advertised.sourceComplete,
    };
    try {
      const raw = await collector(action, identity);
      if (
        !Array.isArray(raw) ||
        raw.length < 1 ||
        raw.length > 16 ||
        JSON.stringify(identity) !== JSON.stringify(session.identity)
      )
        throw new Error('Invalid collection');
      const observations = raw.map((item) => ObservationSchema.parse(item));
      const ids = new Set(session.observations.map((o) => o.id));
      for (const observation of observations) {
        if (
          ids.has(observation.id) ||
          observation.runId !== identity.runId ||
          observation.caseId !== identity.caseId ||
          observation.revision !== identity.revision ||
          observation.source.kind !== 'SYNTHETIC_COLLECTOR' ||
          observation.source.actionId !== action.id ||
          observation.validity.carriedFrom !== null ||
          !permitsObservation(action.id, observation.subject, observation.predicate) ||
          Date.parse(observation.observedAt) > Date.now() + 5_000 ||
          Date.parse(observation.validity.validUntil) < Date.parse(observation.observedAt)
        )
          throw new Error('Out of scope evidence');
        ids.add(observation.id);
      }
      session.observations.push(...structuredClone(observations));
      return receipt(
        request,
        'COLLECTED',
        policy.cost,
        before,
        observations.map((o) => o.id),
      );
    } catch {
      return receipt(request, 'COLLECTION_FAILED', policy.cost, before);
    }
  }

  return {
    execute(raw: unknown): Promise<BrokerReceipt> {
      const parsed = BrokerRequestSchema.safeParse(raw);
      if (!parsed.success) {
        // Invalid input is never echoed into receipts or subsequent model input.
        const fallback: BrokerRequest = {
          requestId: `invalid_${++invalidSequence}`,
          revision: session.identity.revision,
          origin: 'ASTRA',
          actionId: 'INV-SECRET-METADATA',
          target: 'legacy-prod-secrets',
          rationale: 'Rejected malformed request.',
        };
        return Promise.resolve(receipt(fallback, 'INVALID_REQUEST'));
      }
      const request = parsed.data;
      const fingerprint = JSON.stringify(request);
      const existing = pending.get(request.requestId);
      if (existing)
        return existing.fingerprint === fingerprint
          ? existing.promise.then((r) => structuredClone(r))
          : Promise.resolve(receipt(request, 'IDEMPOTENCY_CONFLICT'));
      if (seenIds.has(request.requestId))
        return Promise.resolve(receipt(request, 'IDEMPOTENCY_CONFLICT'));
      seenIds.add(request.requestId);
      const promise = dispatch(request);
      pending.set(request.requestId, { fingerprint, promise });
      return promise.then((r) => structuredClone(r));
    },
  };
}
