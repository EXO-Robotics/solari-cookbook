# Prepared Solari sandbox lifecycle

The Solari detector can prepare one sandbox before an inspection request arrives.
Browser installation happens during preparation. Later inspections reuse that
sandbox and its installed browser, but launch a fresh browser process/context for
each observation. This avoids repeating installation on every click; it does not
establish a particular end-to-end latency until measured.

Set `AIONGUARD_SOLARI_SESSION=WARM` (the default) with the Solari detector
configuration. `FRESH` preserves one sandbox per inspection for comparison.
Credentials remain in the local controller. The current scope remains explicitly
registered, administrator-owned fixtures, not arbitrary hostile websites.

## Readiness and admission

The authenticated `GET /api/sandbox` endpoint reports `EMPTY`, `PREPARING`, `READY`,
`INSPECTING`, `RETIRING`, `BLOCKED`, `CLOSED`, or `DISABLED`. The detector workspace
polls this status and offers **Prepare sandbox** only while `EMPTY`; this sends
`POST /api/sandbox/prepare` with an empty JSON object. A failed status request is
shown as unavailable instead of leaving a stale ready indicator on screen.

Only one inspection can own the sandbox at a time. A concurrent request does not
share a browser or overwrite an in-flight observation. Preparation must finish
before a sandbox is ready. An inspection arriving without a ready sandbox may
still incur preparation delay.

## Retention and retirement

After a successful inspection with no detector findings, the sandbox can be
retained for another inspection. Retention is a resource decision, **not an ALLOW
or a claim that the page or sandbox is safe**. A fresh browser limits ordinary
browser state carryover; it does not reset the guest filesystem or undo a browser
escape. The heuristic detector can miss attacks, so this policy has a different
risk boundary from discarding a VM after every visit.

A detector finding, inspection failure, usage limit, or lifetime limit retires
the sandbox. Retirement removes it from admission before cleanup starts. A
replacement can prepare only after successful retirement; unresolved cleanup
blocks replacement and remains visible. The inspection receipt's retained or
pending state is historical and must not be presented as confirmed destruction.

Default resource bounds are a four-minute total lifetime (including preparation),
two-minute idle timeout, and 100 inspections. The worker's execution budget is
reserved before admission near expiry. Idle retirement does not continually
replenish unused capacity. Controller shutdown retires owned resources; provider
expiry is a backstop, not proof that cleanup completed.

## Evidence boundaries

Measure preparation separately from ready-sandbox inspection latency. Record
whether each inspection reused a sandbox, its inspection count, classification,
and lifecycle outcome. Do not compare cold setup timings with hot inspections
without labeling them. No-match remains undetermined; this mode does not prove
Safari click interception, automatic release of benign links, containment against
hostile pages, or Astra review latency.

## Measured live qualification — September 29, 2026 (New York)

The [JSON report](evidence/warm-solari-2026-09-29/report.json) and
[per-check CSV](evidence/warm-solari-2026-09-29/runs.csv) contain twenty inspections
of the same owned AionPhish fixture in one prewarmed Solari VM:

| Backend inspection latency | Measured |
| --- | ---: |
| Median | 1.414 seconds |
| P90 | 1.485 seconds |
| P95 | 1.487 seconds |

The first VM was created in 0.653 seconds. Initial browser preparation took
36.965 seconds, before the measured checks. Every check launched a fresh browser;
the first used the prewarmed VM and the following nineteen reused that same VM.
The timing runs deliberately trusted the fixture's actual origin to suppress its
credential heuristic. This is a lifecycle calibration, **not twenty benign-page
accuracy tests**. Timing covers backend `inspect()` to validated result, excluding
UI/network handoff, prewarming, asynchronous cleanup, and Astra.

A separate pool with the original trust policy detected `CREDENTIAL_PHISHING` in
1.552 seconds. Its receipt immediately reported `RETIRED`/`PENDING`; the manager
then reconciled cleanup and prepared a different sandbox with zero prior checks.
Shutdown reconciled both pools, left zero unresolved cleanups, and removed the
reservation. A subsequent [inventory audit](evidence/warm-solari-2026-09-29/post-run-inventory.json)
recorded ten complete unfiltered inventories with zero AionGuard resources.
These are bounded control-plane observations, not physical erasure attestations.
They do not repair the earlier cold benchmark's contradicted cleanup receipts.

Reproduce with the documented private Solari configuration and the owned AionPhish
fixture, with its origin excluded from the normal trusted IdP list:

```sh
npm run qualify:warm -- --live --runs 20 --output runtime-data/warm-qualification-new
```

Twenty repetitions of one fixture are a small performance sample. The previous
35.77-second cold median included per-check browser installation and cleanup;
it is a different timing boundary. No detection-rate improvement is claimed.

## Interrupted ownership and review

The private `runtime-data/solari-warm-owner.json` reservation is written and synced
before creation. An existing journal blocks new creation. Do not delete it just
to make startup work. An operator must identify the matching `metadata.inspection`
name using complete unfiltered provider inventories, terminate the owned resource,
and reconcile repeated inventory and direct lookup results before removing the
journal. Ambiguous failures remain blocked. This local journal coordinates one
controller host; it is not a distributed lease across machines.

The lifecycle received a read-only Grok design review using a sanitized protocol,
with no source or credentials sent. Accepted concerns included admission near
expiry, shutdown races, VM-state retention, explicit no-ALLOW semantics, and
full-inventory/direct-lookup disagreement. The implementation and tests cover
those boundaries. Suggestions for physical-resource attestation or authenticated
worker attestation remain unimplemented and are not claimed. Raw signed provider
IDs are secret capabilities and deliberately are not written to the journal.

Validation: 328 automated tests, TypeScript, production build, and browser UI
checks. UI readiness states were checked with labeled software responses; the
live lifecycle and latency evidence above comes from the separate Solari harness.
