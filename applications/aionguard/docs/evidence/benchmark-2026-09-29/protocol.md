# AionGuard benchmark protocol

## What is measured

Two separate experiments produce raw JSON and CSV before any publication graphs:

1. **Cold backend latency:** 50 sequential, fresh Solari sandboxes inspect the same administrator-owned HTTPS fixture using the production `SolariInspector` and detector. Every run installs the browser, collects a screenshot and DOM facts, and attempts cleanup. This is a repeated-fixture latency experiment, not 50 independent detection scenarios.
2. **Controlled detection corpus:** inert synthetic scenarios exercise browser extraction and the detector in one sandbox. Benign, malicious, and ambiguous labels describe the authored scenario intent. Template variants are correlated examples, not a representative or independently held-out phishing dataset. This experiment does not measure fresh-sandbox latency per case.

No model escalation is implemented in the detector workflow. Astra invocation status is `NOT_INVOKED`, its latency is null, and there is no deep-review latency distribution. No finding means `UNDETERMINED`, never `ALLOW`. Detection rates therefore describe heuristic warnings, not safe navigation or actual blocks.

## Timing contract

Host events use one process's monotonic clock, with ISO timestamps for correlation. Provisioning, browser installation/file upload, evidence collection/transfer, validation, cleanup, and local rule evaluation are separate stages. The production inspector returns after cleanup; classification follows. Report request-to-classification latency including this cleanup, not an imaginary decision-before-cleanup fast path.

Optional guest telemetry uses its own monotonic origin: worker start, browser ready, navigation start, DOM content loaded, DOM facts collected, screenshot collected. Guest durations are diagnostic components within the host collection interval. Never subtract a guest wall clock from a host wall clock or add nested component timings to their enclosing stage. `pageLoaded` means DOM content loaded, not network idle or full visual stability.

There is no physical click timestamp, Safari interception measurement, navigation release, Astra call, or measured host-exposure result. These values must stay null/unverified. Browser routing and script-disabled execution do not prove infrastructure isolation or absence of host network contact. A future containment experiment needs independent host/guest network observation and a controlled canary.

## Failure and summary contract

Record all attempted runs, including provider refusal, timeout, invalid evidence, and cleanup failure. Successful duration distributions must state their sample count beside requested, attempted, failed, and unfinished counts. Quantiles use the nearest-rank convention (ceil(p × n), one-based); a small sample P95 is not a stable tail estimate. “Cold” means a fresh sandbox and browser installation per run; provider, package-download, and website caches were not flushed or controlled. No retries replace failed rows. Stop on unresolved cleanup or three consecutive unavailable inspections and retain partial results.

The latency run uses one fixed fixture and a fixed expected category declared before execution. Expected classification is an assertion to compare with observation, never an input to the detector. A fast failure is not a successful nominal check. Corpus accuracy excludes ambiguous intent and unavailable extraction from its primary confusion matrix, reports those denominators separately, and must retain failures for conservative interpretation. A correctly warning detector can still flag legitimate unlisted login pages and security tutorials.

## Reproduction

Use Node 24 and the private Solari configuration described in the [README](README.md). Keep the API key in the controller only. Use owned, harmless fixtures. The latency benchmark creates up to 50 billed, sequential sandboxes; the corpus uses one additional sandbox. Both have bounded lifetimes and explicitly require `--live`.

```sh
npm run benchmark:solari -- --live --runs 50 --expected-category CREDENTIAL_PHISHING
npm run benchmark:corpus -- --live
```

Outputs are written to ignored `runtime-data` by default. Export only reviewed reports, never private `.env` files, raw provider errors, or signed sandbox identities. Source and fixture hashes bind the reports to the measured implementation; old release evidence remains a record of its original version.

## Product interpretation

Pre-navigation inspection is the product direction: an external link is held while a remote environment inspects it. The present submission measures the inspection backend. It does not yet demonstrate the full click → inspect → allow/block flow. Performance figures cannot establish that the system prevents exposure or blocks most phishing.

## Advisory review

Grok reviewed the sanitized measurement plan read-only, without source, credentials, web search, or subagents. Accepted: preserve failure and unfinished denominators, separate successful conditional percentiles from all-attempt stage measurements, predefine and hash corpus labels, keep host/guest clocks separate, and report containment as unmeasured. The repeated live page also records normalized observation and screenshot hashes to expose content drift.

Rejected: calling backend latency “time-to-safe-result” (there is no safe verdict), and relabeling known legitimate unlisted logins or tutorials as ambiguous merely because they trigger rules (that would hide false positives). Guest timing bounds exceed the 30-second worker command deadline; an invalid timing payload remains an explicit failed attempt rather than silently disappearing. Broad host-residue and infrastructure-denial experiments remain future qualification work, not demonstrated outcomes.

## September 29 results

The revised series completed **50/50** fresh sandbox inspections with identical normalized observations and screenshots. All 50 initially reported cleanup `CONFIRMED`, but the retrospective audit contradicted that check; per-run cleanup assurance is **UNVERIFIED**. All 50 sandbox identity hashes are distinct. Median backend request-to-classification time was **35.77 s**, P90 **38.55 s**, and P95 **40.99 s**. Median provisioning was **0.236 s** and browser installation/file setup was **32.77 s**. This implementation spends most of its time preparing the browser; these measurements do not establish a practical inline click delay.

The first series stopped on its second attempt with cleanup `UNRESOLVED`. A subsequent authenticated inventory was empty. We preserved that result, added bounded exact-tag inventory convergence checks, and ran a new series. It is not pooled with the revised implementation's results.

The controlled corpus completed all 150 cases without extraction errors. Its reported cleanup was also contradicted by the later inventory audit. It flagged **55/90 malicious-intent scenarios** and **25/50 benign scenarios**; 10 ambiguous cases were excluded. TP=55, FN=35, FP=25, TN=25: TPR **61.11%**, FPR **50%**, precision **68.75%** on this authored mix. The 30 templates and five correlated variants are deliberately diagnostic, including difficult legitimate-login and tutorial cases. They are not representative prevalence or held-out validation. No-finding still means undetermined, not allowed navigation.

[Raw CSV/JSON and retained first-series failure](README.md). The measured latency source is commit `271fcaee8d8f0e6eafc1b8828c9ea4d610f4b31a`; the corpus includes the same bounded cleanup helper and carries its own source hashes. The final source passed **296 tests**, typecheck, production build, and formatting. No graphs or new social claims were published.

### Retrospective cleanup contradiction

A complete unfiltered resource inventory later listed benchmark resources as running after their receipts reported `CONFIRMED`. Filtered inventories and point lookups also disagreed across requests. This is evidence of an inconsistent provider control-plane view; the underlying provider cause is unverified. A termination acknowledgement plus one empty filtered inventory is insufficient lifecycle proof here, including when retried until the first empty result.

The audit reconciled the union of matched benchmark identities, repeated idempotent termination requests, and obtained ten consecutive complete inventory samples with none of those resources present. This is post-run reconciliation, not proof of immediate cleanup at each decision. No additional sandboxes were created after the discrepancy was discovered. The original receipts remain unchanged; **audited-results.json / audited-results.csv and the corpus audited-report.json / audited-cases.csv are the primary handoff**. They mark cleanup assurance unverified and identify the late-listed runs. Successful-latency labels in the raw original report describe the original check only, not retrospectively verified lifecycle success.

Do not use this benchmark to claim reliable immediate destruction, host containment, or a safety-qualified fast path. Resolve and independently qualify provider lifecycle consistency before those product claims. Browser preparation and detection coverage are also unfinished product work.
