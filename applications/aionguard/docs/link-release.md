# Check, then continue

AionGuard performs a background check before opening the registered destination:

- **RELEASE:** a completed live inspection returned no warning signs. Open the inspected URL.
- **BLOCK:** a detector found warning signs. Show the evidence and keep the link blocked.
- **REVIEW:** the check failed, returned incomplete evidence, or cannot be matched to this navigation. Keep held so the user can review or retry.

The message is **“No warning signs detected”**, not “safe.” The five checks can miss attacks. Releasing a page allows it to run in the protected browser; this is an inspection checkpoint, not remote browser isolation.

## Release contract

`NO_FINDINGS_V1` requires a successful LIVE detector inspection with validated screenshot and observation evidence, zero findings, the registered URL as the final URL, no redirect to another destination, and evidence no more than 15 seconds old. The sandbox must be retained in a healthy state or have confirmed cleanup. The registered URL binds the decision to the navigation; it is **not a trusted-site allowlist**.

Only the controlled Chrome handoff can receive browser-release authority. Direct Inspect-button runs report their result without navigating a browser, and mock results never authorize release. Astra remains advisory.

The worker checks the grant against the original held document, tab, request and run, then consumes it before installing a tab-specific, exact-URL GET exception. A temporary navigation guard blocks changed redirect destinations. Commit, error, expiry, disarm and reconfiguration remove the exception. The released document can load its own project-path assets; the next navigation clears that asset allowance.

## Scope

This completes the existing controlled Chromium flow for a configured URL. It does not turn the disposable extension into an installed, general-purpose Safari or Chrome product. The inspector disables page scripts and has bounded evidence coverage; a page may behave differently in a normal authenticated browser or change after inspection. HTTP request counts do not prove zero DNS/TCP/TLS contact or hostile-page containment.

The original v1.2.0 release and its 1.98-second blocked-click evidence remain frozen. New release measurements are recorded separately; no result is inferred from the old benchmark.

## Reproduce the live browser pair

After the [Solari setup](quickstart.md), build the UI and run:

```sh
npm run build
node --import tsx scripts/qualify-release.ts --live --output runtime-data/release-qualification-new-run
```

Use a fresh output directory. The harness uses the existing owned celebration page for RELEASE and the owned phishing page for BLOCK, with separate baseline and protected profiles for each. Preparation occurs before the click. It saves JSON/CSV results, receipts, screenshots, source hashes, and CDP/NetLog request counts. Raw browser profiles and NetLogs stay private under `runtime-data`.

The software suite currently passes **434 tests**, including release/replay ownership and cleanup regressions. The original 388-test v1.2.0 package is unchanged.

## Measured live result — September 30, 2026

| Controlled page | Outcome | Time from click | Protected-browser destination HTTP requests |
| --- | --- | --- | --- |
| Benign celebration page | RELEASE, page loaded | 2.07 s release request; **2.27 s loaded** | 3, after release was requested |
| Phishing fixture | BLOCK, warning shown | **1.78 s warning** | **0** |

One prepared-sandbox run per page, not a percentile benchmark. Chromium NetLog and CDP agreed on request counts. The benign grant was consumed and its navigation exception removed after commit. Both controllers exited successfully with their ownership journals cleared. [Ten independent post-run inventories](evidence/link-release-2026-09-30/post-run-inventory.json) found zero AionGuard resources.

[JSON results](evidence/link-release-2026-09-30/report.json) · [CSV](evidence/link-release-2026-09-30/summary.csv) · [Released page](evidence/link-release-2026-09-30/benign/protected-released.png) · [Blocked page](evidence/link-release-2026-09-30/phishing/protected-warning.png) · [Review and fixes](release-review.md)

An earlier attempt opened the benign page but did not confirm cleanup in the controller. Ten subsequent complete inventories found zero remaining resources. The cleanup error path was corrected and both cases were rerun successfully; those earlier measurements are not counted in this table.
