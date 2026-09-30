> Public planning copy. Read [current build decisions](../../../build-decisions.md) first. Links to omitted historical material point to [publication notes](../../../planning-provenance.md); raw receipts remain in the original source bundle.

# MicroVM feature qualification — Vercel; E2B pending

Scope: disposable provider/runtime and stock-service primitives for the attached AionGuard plan. No AionGuard application, broker, correlation engine, recovery verifier, or submission code was built. E2B remains NOT RUN because its API key has not been supplied.

**Result:** Vercel passed the bounded core provider and stock-service primitives tested here, with two fresh main rounds and two stricter supplemental rounds. E2B remains NOT RUN. This is sufficient evidence to proceed with Vercel integration experiments; it is not a completed AionGuard feature qualification or a provider performance winner.

The completed main suite recorded 52 passing assertions and the supplement 27, with no failed assertions in either corrected suite. These counts include repeated and overlapping checks, not 79 distinct features. Separate execution-proven VM-expiry observation passed. Earlier setup and aborted-run failures are preserved. The stricter executed-workload checks observed 33 and 34 successful worker samples with no failed samples, and three distinct fresh challenge/output cycles spanning 63.385 and 65.153 seconds. Old-worker access remained denied during the sampled recovery windows.

## Required capabilities and evidence

| Capability | Evidence | Boundary |
|---|---|---|
| Fresh VM/browser per click | Prior 30-run corrected latency batch, unique environments, empty browser cookies and absent prior-run marker | Behavioral freshness; not independent hypervisor proof |
| Rich remote inspection | Two fresh browser runs: final URL, title/text, password fields, absolute/relative form actions and origins, HTTP redirect, requests, PNG | Harmless owned specimen only; request observations are not universal egress visibility |
| Navigation failures | Explicit blocked-by-client error and browser timeout, with cleanup | Product must map failure to unavailable/block |
| Real synthetic POST and capture | Browser request-body hash equals independently retrieved captured bytes in both rounds | Browser success alone was not counted as capture |
| Separate replay actor | Actor reads actual collector bytes and POSTs to separate monitor VM; independently queried monitor hash matches | No attacker identity or real compromise claim |
| Scoped ingress/service authority | Anonymous reads denied; write-only identity cannot read records; actor cannot read monitor events or admin path | Uses stock nginx Basic auth. Public preview URL alone is not private or a workload identity |
| Actor stopped / capture missing or unavailable | Bounded recorder observations and guarded actor tests | Does not establish delayed ingestion, event completeness or product absence logic |
| Optional declared vs actual destination | Owned A declaration differs from actual owned B; request and collector hashes agree | Controlled JavaScript only, not service-worker/universal network coverage |
| Egress policy | Same owned target succeeds before restriction, fails afterward while other target remains allowed and blocked target stays independently healthy; Chromium also tested | Ordinary HTTPS and DNS; not adversarial bypass testing or whole-Mac quarantine |
| Live lockdown | deny-all tested with control channel retained | Source protected-service credentials remain revoked |
| Files/source transfer | Exact SHA-256 round trip; clean template and separately supplied replacement credential | No suspect-worker state copied; not a Git integration qualification |
| Background execution/reconstruction | Actual hash-pinned generic polling program launched in new worker, fresh challenge output independently checked over >=60 seconds and repeated | Stateless HTTP workload; not Release Coordinator jobs or state recovery |
| Source revocation | Continuing source client succeeds before stock-service credential removal and is denied during/after fresh-worker operation while service stays healthy | Per-request service authentication, not arbitrary persistent-session revocation |
| Replacement permission ceiling | Allowed operation returns 200; prohibited path 403; old identity 401 | Narrow demonstrated policy only |
| Process/command errors | Nonzero exit/stderr, timeout-specific result/no delayed effect, observed process terminal state | Bounded faults, not resource exhaustion or sandbox escape testing |
| VM expiry | Requested 10 seconds; main probe stopped by 16.1 seconds. Separate execution-proven VM stopped by 13.9 seconds (still running at 11.6 seconds) | Coarse observation, not a precise hard deadline. Use supervised explicit stop |
| Cleanup | Explicit stop before delete, final project inventory, temporary snapshot deletion | Empty inventory and terminal states reported separately |

## Product acceptance still required during the build window

These are not microVM features and cannot be certified by standalone provider probes:

- Apple Mail → intended Safari profile → request-level hold before local destination access → automatic remote inspection; modified clicks, redirects/prefetch coverage; fixture allowlist; real integrated Astra/broker/evaluator/receipt handling.
- Tripwire issuer/collector/actor/monitor authority boundaries in the actual application; unknown or altered IDs; wrong/missing secret classification; expired/revoked pair validity; delayed ingestion and closed-window checkpoints; append-only corrections and telemetry deduplication.
- Continuity authoritative no-outstanding-jobs cutover; actual job IDs/artifacts; stale/duplicate work rejection; unapproved source/checkpoint rejection; effective permission equivalence and broader-authority rejection; required C/T/O/A/R verdict handling; no automatic restoration of old access on failure.
- Full application latency/cost/load reliability, physical-host quarantine, sandbox-escape resistance, full browser recording/replay and hard resource-exhaustion enforcement.

No full feature-release or accepted-recovery claim follows from these primitives. E2B needs the same live qualification before choosing between providers.

## Implementation lessons

- Prepare a clean browser image once, including the working directory needed by the SDK file-transfer API. Each click still gets a fresh VM.
- Vercel requires snapshot expiration of at least one day (or no expiration). We explicitly remove temporary feature snapshots after use.
- Explicitly stop and observe shutdown before deleting; the prior delete-only batch exhausted the Hobby concurrency allowance.
- Keep VM cleanup supervised outside the display critical path; automatic expiry is a backstop.
- Keep provider credentials on the control host. Use separate narrowly scoped temporary service credentials in guest workers.

## Prior latency and costs

The earlier corrected 30-run light-page benchmark returned evidence in about 2.9 seconds median, with sequential sample p95 about 5.3 seconds. Fresh VM creation was about 0.25 seconds. These full-feature probe runs add file uploads and intentional fault tests; their elapsed time is not a normal-click benchmark. Subsecond user-visible inspection is not established.

Pricing and runtime references checked in this session:
- https://vercel.com/docs/sandbox/concepts/firewall
- https://vercel.com/docs/sandbox/concepts/snapshots
- https://vercel.com/docs/sandbox/pricing
- https://nginx.org/en/docs/http/ngx_http_auth_basic_module.html
- https://e2b.dev/pricing

## Evidence interpretation and retained failures

The main suite contains a few broad assertions whose names must not be read as stronger proof than their raw observations. The supplemental suite supplies the stronger execution evidence: positive-baseline egress, actual background replacement execution, terminal process waits, failed-capture guard behavior, and timeout with no delayed file write. Strict inspection review separately confirms both exact form paths, expected title and blocked-by-client error.

Preparation initially failed because a one-hour snapshot expiration is below Vercel's allowed minimum. The first feature suite then stopped at an SDK file-transfer working-directory error; those aborted rounds are NOT feature passes. That run also observed a five-second VM still running after seven seconds. The snapshot was rebuilt with the required directory. All initial artifacts remain included.

Earlier byte-recorder and service tests ran in separate VMs, but the controlling provider account can administer all of them. This is stronger runtime separation than processes in one VM, not tamper-resistant independent verification. Basic-auth role tests are narrow stock-service checks. No integrated correlation, expiry, deduplication, identity-provider or stateful job service was built.

## Portable evidence and provenance

This folder includes sanitized JSON observations and the two inspection PNGs; executable probe sources, specimen HTML, credentials and project configuration are deliberately excluded. Source hashes retained in observations identify the disposable programs but do not authorize their reuse. Browser preview origins in JSON are consistently pseudonymized to reserved `.invalid` hostnames; relative/absolute form structure remains reviewable. These are offline evidence records, not live URLs.

Corrected feature VMs and feature snapshots were deleted; final independent inventory was empty at collection. The earlier clean browser benchmark snapshot was retained with its existing expiry for the then-pending comparison. This bundle does not assert that any historical resource is still available, nor require reuse of a pre-event image.

Original local reports: sandbox-provider-probes/2026-09-09/REPORT.md and features/REPORT.md. The earlier latency batch used the pinned dependency lockfile; installed SDK/package identity is recorded in provenance.json. The full product remains unbuilt.
