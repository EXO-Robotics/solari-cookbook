# AionGuard measured benchmark data

Measured source: `271fcaee8d8f0e6eafc1b8828c9ea4d610f4b31a`. Final-series source hashes verified against the measured implementation. The initial stopped series retains its earlier pre-fix hashes.

## Cold backend latency

Requested 50; attempted 50; completed 50; completed observations 50; per-run cleanup assurance UNVERIFIED despite 50 initially confirmed receipts; not attempted 0. Stop reason: None.

| Stage | n | Median (s) | P90 (s) | P95 (s) |
| --- | ---: | ---: | ---: | ---: |
| backendDecision | 50 | 35.7703 | 38.5534 | 40.9914 |
| provisioning | 50 | 0.2355 | 0.4033 | 0.5136 |
| browserSetup | 50 | 32.7725 | 35.4783 | 38.3588 |
| collectionAndTransfer | 50 | 1.7315 | 2.5768 | 3.1480 |
| cleanup | 50 | 0.6754 | 1.3852 | 1.5240 |
| rules | 50 | 0.0004 | 0.0007 | 0.0009 |
| pageLoad | 50 | 0.1133 | 0.6883 | 0.7472 |
| observation | 50 | 0.0270 | 0.0320 | 0.0329 |

Guest pageLoad/observation are nested diagnostics and must not be added to their enclosing host collection stage. pageLoad ends at DOM content loaded. The backend result includes browser installation and cleanup; it is not click-to-navigation latency. Percentiles are nearest-rank on the 50 completed observations. Cleanup confirmation was retrospectively disputed; these are not safety-qualified decision latencies.

## Controlled detection coverage

150 authored cases from 30 templates with five correlated variants each. Extraction completed: True; cleanup assurance: UNVERIFIED (reported CONFIRMED); errors: 0; ambiguous excluded: 10.

TP=55, FN=35, FP=25, TN=25. TPR=0.6111111111111112, FPR=0.5, precision=0.6875. These are heuristic warning rates on this synthetic mix, not real-world accuracy, ALLOW/BLOCK rates, or an independent held-out evaluation.

## Limits and retained failure

Astra review, click interception, safe navigation release, and host-exposure containment were not measured. No-finding output is UNDETERMINED. No publication graphs have been generated.

The original latency series stopped at run 2 due to unconfirmed immediate cleanup. A subsequent authenticated inventory check found no AionGuard resources. Its result remains unresolved in the original record. The revised series used bounded inventory convergence checks, but a later audit found runs 47, 48, 50 and the corpus still listed. Filtered lists and point lookups disagreed. Repeated termination followed by ten consecutive full inventory samples found no matched resources remaining. Immediate cleanup assurance is still unverified for the series.

Primary handoff: latency/audited-results.csv and audited-results.json; controlled-corpus/audited-cases.csv and audited-report.json. Original unmodified results remain alongside them; initial-stopped-series/ retains the failed experiment. All timestamps and per-stage observations remain available in JSON/JSONL.
