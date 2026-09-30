# Evidence and synthetic environment

Exports from `src/server/fixtures/index.ts`: `catalogFor(variant)`, `createSyntheticEnvironment(variant, {now?})`, `DIRECT_RESOURCES`, `JENKINS_ADVISORY`, and `jenkinsApplicability(version)`.

The independent environment exposes `initialObservations(identity, now?)`, `collect(canonicalAction, identity)`, and `applyChange(identity, authorization, observations, now?)`. It binds run, attempt, ledger and revision. Call `initialObservations` before collecting. No truth object is exported. All nine collectors have fixed coverage and exact canonical requests.

Exports from `src/server/evidence/index.ts`: `evaluate(identity, observations, authorization, now?, context?)`, `deriveAccess(identity, observations, now?, context?)`, `usableObservations`, `hypothesisDefinitions`, and `hasAuthorization`. `now` accepts a Date, epoch milliseconds or ISO timestamp. After changing, pass `context: {change, receipts}`. Original observations remain in the array for provenance. `change.carriedObservationIds` identifies new copied observations, each referring to the original observation and exact change.

Post-change CLI evidence is eligible only with a collected, one-credit `OPERATOR_VERIFICATION` receipt at the current revision. The write itself supplies no effective availability observation. Unchanged evidence retains timestamps and expiry. Missing or invalid lineage is ignored; material conflict prevents dependent conclusions, and an independent undisputed falsifier can still dismiss.

The pinned Jenkins record uses the vendor's [2024-01-24 advisory](https://www.jenkins.io/security/advisory/2024-01-24/): affected weekly versions through 2.441 and LTS through 2.426.2; fixes 2.442, 2.426.3 and 2.440.1. CLI disabling is only a short-term workaround. No exploit or consequence validation is implemented.

Only the canonical and two planned comparison variants are implemented. Stale/incomplete ledger evidence is exposed with truthful metadata and cannot support a current verdict. Initial access counts derive from the seven direct resource observations. Staging permission is downstream context and is excluded from those counts.

No live inspection, model call, deployment or demo run is performed by this module.

Validation: TypeScript typecheck and `npm test -- tests/evidence/engine.test.ts` pass, with 44 tests. Coverage includes all nine collector boundaries, independent state, no paid initial truth, scope authorization, wrong subject/run/case/revision, stale/incomplete/expired/future facts, context-only sources, incorrect collector provenance, conflicting authoritative values, duplicate IDs, cumulative depth, independent falsifiers, weekly/LTS version limits, all three planned variants, immutable baseline, manifest-bound carry-forward, invalid post-change receipts, successful paid verification, expiration and duplicate writes.

The environment and observations are synthetic. Passing these unit tests does not establish real Jenkins state, Safari interception, Vercel isolation, live model behavior, production scale or demonstration readiness. Semantic initial-state hashes for comparison must exclude independently generated observation/source IDs and run-specific timestamps.
