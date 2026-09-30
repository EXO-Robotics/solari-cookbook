> Controlled click update: [one real Chromium click comparison](controlled-click.md) now shows 4 local destination HTTP requests without protection versus 0 with AionGuard, with a warning in 1.981 seconds. Automatic safe-link release remains unimplemented. The record below preserves earlier milestones.

> Submission package update: the [README](../README.md) now leads with the product, visuals, and measured warm performance. New evidence includes [six Astra advisory reviews](astra-review-benchmark.md) and [direct UI click timing](click-timing.md). These are separate measurements; a later controlled intercepted-link measurement is linked above.

> Current lifecycle update: the default Solari detector now prewarms and reuses a bounded sandbox until a finding/error, then retires and replaces it. See [warm qualification](warm-solari.md) for the measured 1.41-second median / 1.49-second P95 and separate cleanup audit. Earlier evidence below describes its original fresh-sandbox candidate.

# AionGuard: bare-bones Solari detector

September 29, 2026, America/New_York. Based on public AionGuard commit `a40841e6678487aef3f0b207b0a7aeec1e4c9c30`.

## Delivered scope

A local authenticated operator UI inspects one configured, owned HTTPS fixture in a fresh Solari sandbox, obtains a screenshot and bounded DOM facts, applies five deterministic web-threat heuristics, explains findings, and exports a hashed receipt. No findings is `UNDETERMINED`; incomplete inspection is `INSPECTION_UNAVAILABLE`. Neither means safe. The inspection-only authorization cannot authorize an organizational change.

Five implemented categories: credential phishing, external password forms, executable download lures, tech-support scams, and ClickFix command lures. Categories can overlap. They are practical coverage choices, not an empirically established ranking of the five most common attacks. No model is required. Astra, IT email, Tripwire, continuity and local-VM integration are excluded.

## Video context and provider choice

The [demo video](https://www.youtube.com/watch?v=UJkPWHyTg-U) was recorded using Vercel Sandbox during the OpenAI Astra Hackathon in New York. It shows the earlier Vercel build. The current submission runs on Solari; the evidence below documents that integration separately.

Solari is our preferred provider for speed and convenience, not a benchmarked speed claim. Additional VM providers can be supported through implemented and validated adapters. See the [submission post draft](submission-post.md).

## Latest benchmark qualification

The [September 29 benchmark](benchmark.md) adds 50 cold backend inspections and 150 authored detection cases. Its later inventory audit contradicted the original cleanup confirmation method. Treat the historical `CONFIRMED` receipts below as recorded observations, not independently established immediate resource destruction. The benchmark retains raw receipts, contradictory inventory records, and a later reconciliation audit. Per-run lifecycle assurance remains unverified.

## Verification

- **286 tests passed across 17 files** under Node 24.19.0, plus TypeScript and production build. Formatting and Git whitespace checks passed.
- **Live owned website:** Solari returned the AionPhish page observation and screenshot, matched the unapproved-password-origin heuristic, and confirmed cleanup. The standalone successful run took 35.442 seconds. [Receipt](evidence/solari-2026-09-29/live-inspection.json) · [Screenshot](evidence/solari-2026-09-29/inspection.png).
- **All five detectors plus benign control:** Six inert HTML fixtures rendered in script-disabled Chromium within one fresh Solari sandbox. Every case produced exactly its expected categories; benign produced none. Cleanup confirmed. These are synthetic browser-extraction checks, not six live websites or six independent sandboxes. [Report and source hashes](evidence/solari-2026-09-29/synthetic-fixtures.json).
- **Operator UI:** connect, create, authorize, inspect, findings and screenshot displayed with cleanup confirmed. Direct operator trigger recorded; zero synthetic organization observations and no planner dispatch. Desktop and 390-pixel checks showed no horizontal overflow or browser exceptions. [Final UI receipt](evidence/solari-2026-09-29/operator-receipt.json) · [UI capture](evidence/solari-2026-09-29/detector-ui.png).

## Failures retained and fixed

The first live inspection succeeded but returned cleanup `UNRESOLVED`: the initial adapter tried to confirm deletion via a point lookup after the provider invalidated the signed identity. It also used SDK `close()`, whose warning included the session capability. The final adapter uses supported `kill()` and exact-tag authenticated resource inventory confirmation; signed provider IDs are hashed before receipts and are not intentionally logged. The first job was absent from the tagged inventory afterward. Its local failure record was retained and is not relabeled as a pass.

The initial sandboxed HTTP test attempt could not bind loopback (`EPERM`). The suite was rerun with loopback access and passed. These environmental failures are distinct from the successful final tests.

## Boundaries

- Direct remote inspection does not demonstrate Safari interception or suppression of local requests. The inherited Safari path is not requalified in this candidate.
- Only the configured owned fixture is admitted. The browser permits scoped HTTPS GET/HEAD; page scripts, service workers, downloads and credential submission are disabled. **Provider-level egress filtering is unverified. Do not use this candidate on arbitrary hostile websites.**
- Cold setup installs pinned Playwright 1.58.2 in a fresh guest. Dependency installation needs network and may be slow. The base template and transitive system packages are provider-managed, not a reproducible sealed image.
- A matched heuristic is a warning, not proof of phishing, malware or exfiltration. Legitimate unlisted login pages and security tutorials can match. Inspection covers the first 1000 body characters, one password form and up to 20 links from the first 200 anchors. No OCR, iframe or JavaScript-only attack coverage.
- Cleanup confirmation means a successful resource termination request and no matching resource in an authenticated, unpaginated exact-tag inventory. It does not prove erasure of provider logs. Ambiguous create/cleanup retains admission capacity. A process crash loses in-memory state: reconcile tagged resources independently before restarting. No durable reaper or production reliability claim.
- Provider credentials stay in the local controller; no host environment or volumes are injected into the guest. No claim is made that the provider's base image has been exhaustively audited.
- Receipts hash their content; this is integrity bookkeeping, not independent attestation. Private keys, local env files, controller tokens and raw signed provider identities are excluded from the source handoff.

## Independent review

Grok reviewed a sanitized design summary, with web and subagents disabled, not source or credentials. Accepted: global limits must cover no-match outcomes; provider provenance and failure/cleanup states must remain explicit; keep browser routing distinct from infrastructure egress control; maintain owned-fixture scope. These are implemented or disclosed above.

Rejected after source inspection: undetermined is already an explicit status; direct inspection fetches in the guest, not on the controller; Safari is a trigger label, not a claimed remote engine; facts come from the rendered DOM including resolved form actions, not raw HTML regex; route installation precedes navigation; path boundaries and PNG sizes/dimensions are checked; auth uses bearer tokens, not cookies. Broader `formaction`, Unicode evasion, sealed browser images and durable restart recovery remain limitations, not completed capabilities.

## Reproduction and reference

Follow the [README](../README.md). `npm run qualify:solari` creates one real inspection sandbox; `npm run qualify:detectors` creates one fixture-test sandbox. They load the private local `.env` and configured provider env file. Both preserve reports in ignored `runtime-data`.

Provider integration was checked against [Solari sandbox documentation](https://docs.getsolari.com/sandboxes) and the [TypeScript SDK reference](https://docs.getsolari.com/sdk/typescript/sandboxes). Historical Vercel results retain their identity in [the earlier evidence record](integration-verification.md).

This standalone repository is the Solari submission edition. Publication makes the source and evidence available for review; it does not establish that the Solari team has received or accepted a submission.
