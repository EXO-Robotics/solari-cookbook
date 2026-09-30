# Original core verification record

This software-only checkpoint predates the subsequently authorized live integration. See [the current integration record](integration-verification.md) for Vercel, Astra, recovery and remaining device gates.

Recorded September 10, 2026. This record covers the implemented software, not the deferred live demo.

## Automated results

- Node 24.19.0; npm with a pinned lockfile.
- `npm run check`: TypeScript passed, **141 tests across 11 files passed**, production Vite build passed.
- `npm run format:check`: passed.
- Dependency audit: zero reported vulnerabilities at this check. This is not a guarantee against unknown vulnerabilities.
- `npm run compare`: six independent deterministic baseline rows across the three frozen variants. Zero actual Astra calls and zero Vercel calls.

Coverage includes scoped collector outputs, current/complete/authoritative evidence, subject and revision binding, material conflicts, cumulative E0–E4, immutable baseline, exact carry-forward references, fresh paid verification, budget exhaustion, concurrent retries, failed collectors, malformed model output, process timeout/output limits, serialized page-marker exclusion, snapshot/output validation, cleanup/capacity failures, extension rule generation, HTTP authority boundaries and precomputed comparison matching.

Integration checks establish block-before-planning, no normal scenario on unavailable inspection, unchanged baseline while the current revision is inconclusive after a write, successful fresh verification, and an honest verification gap after an alternate four-credit route. Neither missing evidence nor zero retained hypotheses is treated as success.

Initial test failures were retained in the work session and corrected: one strict catalog-label mismatch at integration, one test-only action-index error, sandbox denial of local test listeners, and one whitespace-sensitive extension wording assertion after formatting. The HTTP tests were rerun on permitted loopback listeners. No live provider was substituted into tests.

## Measured deterministic baselines

All rows dismissed HYP-001 under its recorded assumptions and reserved one credit for successful fresh synthetic verification.

| Variant | Greedy baseline Jenkins depth | Coverage-aware baseline Jenkins depth | Astra |
| --- | --- | --- | --- |
| Canonical | E3 | E4 | Not measured |
| Runtime identity already known | E4 | E4 | Not measured |
| Ledger stale/incomplete | E3 | E3 | Not measured |

The canonical greedy policy chose the narrow principal check first. Coverage-aware chose the shared Activity Ledger. Both chose the narrow status check when the runtime identity was already known or when the ledger could not supply current complete facts. These are measurements of these policy/fixture versions, not proof of general superiority. Full timestamped reports remain in local `runtime-data/comparisons/`; the UI only displays matching initial-state/scenario/action/policy versions and never imports their observations into a case.

## Browser verification

Used a fresh headless Chromium session through agent-browser 0.37.1, exclusively against `127.0.0.1` in explicit MOCK mode with disposable test tokens. Existing Safari tabs and profiles were not used or modified.

Verified operator connection, attempt creation, explicit scenario authorization, software-check dispatch, baseline results, the inconclusive post-write state, paid fresh verification, evidence/ledger navigation, and the responsive layout. At 390 px width the page had no horizontal overflow or blank/error overlay. A desktop/narrow-viewport accessibility audit identified contrast and landmark issues; corrections are included in this implementation. QA screenshots stayed local and are not demo assets.

## Remaining acceptance gates

| Gate | Status |
| --- | --- |
| Shared contracts, isolated implementation lanes, local build | Passed software checks |
| Real Safari request interception and no-local-destination request | Deferred; not verified |
| Registered external click → fresh Vercel VM → real Astra → complete case, twice | Deferred; not run |
| Fresh clean-image build and provider cleanup/quota measurement | Deferred; not run |
| Actual Astra comparison and semantic assertion review | Deferred; not run |
| Live fixture/Pages deployment, extension install and presentation rehearsal | Deferred by owner |
| Tripwire | Unimplemented; Phase 1 live release gate not met |
| Continuity | Unimplemented; Tripwire release gate not met |

No cloud deployment, VM creation, snapshot creation, Safari installation, real credentials, form submission, exploitation, live case, or recorded demonstration occurred in this pass. Provider/model adapters are implemented and tested through injected interfaces; they are not claimed integrated-live-verified.
