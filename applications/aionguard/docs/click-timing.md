# Click to result

AionGuard can now time a click on **Inspect registered URL** through to the result appearing in the workspace. Use **Timing JSON** or **Timing CSV** to download the last 100 checks from the current tab. This export stays local and contains no controller token, page text, screenshot, or destination URL.

This is a **direct operator click** measurement. A later [controlled Chromium comparison](controlled-click.md) measures an actual intercepted link separately. We do not call a hold-page arrival the original link click, and have not changed the extension or its protection lease.

## What the clock measures

| Point              | Meaning                                                         |
| ------------------ | --------------------------------------------------------------- |
| Click              | The Inspect button handler starts.                              |
| Request dispatched | The authenticated inspection request is about to be sent.       |
| Response parsed    | The controller response has arrived and passed the case schema. |
| Result committed   | React has committed that case’s result to the workspace DOM.    |

All browser durations use `performance.now()` in the same page. Server inspection/decision timestamps are included separately from the existing receipt; only server timestamps are subtracted from other server timestamps. Changes to a machine’s wall clock cannot distort the monotonic browser duration.

“Result committed” does not include screenshot loading or prove a physical screen paint. The export records tab visibility at the start and finish; hidden-tab or background scheduling can affect this measurement. An HTTP failure gets a failure record, not an invented successful latency. A completed inspection with unavailable evidence retains that explicit result.

## How to collect evidence

1. Start the controller and connect to the workspace. Wait for **Sandbox ready** for a warm measurement.
2. Create and authorize an inspection, then click **Inspect registered URL**.
3. Read **Click to result**, then download JSON or CSV. Each record includes the case/run ID and request ID for correlation with its receipt.
4. Create another inspection for another sample. Export before reloading or closing the tab; timing history is deliberately held only in memory.

The default detector does not invoke Astra. Records therefore say `astraStatus: NOT_INVOKED`, and distinguish `LIVE` from `MOCK`. JSON carries server timestamps and lifecycle status; CSV carries the corresponding latency, classification, cleanup, provider, and mode fields. Neither format claims automatic navigation release or browser interception: `interceptionVerified`, `navigationReleased`, and `physicalPaintVerified` are false.

The existing 20-check warm backend benchmark remains a separate dataset. This instrumentation does not retroactively turn it into a click-to-result benchmark. Actual intercepted-click timing needs an independently verified interception boundary and a clock tied to the original user action.

## Live UI observations — September 30, 2026 UTC

The real local Inspect button was exercised through browser automation with a
live Solari backend and the owned AionPhish fixture:

| Condition | Click to DOM result | Samples |
| --- | ---: | ---: |
| Sandbox ready before the click | **1.765 seconds** | 1 |
| Sandbox expired while idle; preparation needed | **38.069 seconds** | 1 |

Both produced a credential-phishing finding with the normal trust configuration.
These are individual observations, not medians or percentiles. The cold case is
preserved to show the delay when a prepared VM is unavailable. The warm case's
receipt records readiness before the server accepted the inspection.

[Summary](evidence/click-timing-2026-09-30/summary.json) ·
[Warm JSON](evidence/click-timing-2026-09-30/warm-click.json) ·
[Warm CSV](evidence/click-timing-2026-09-30/warm-click.csv) ·
[Cold JSON](evidence/click-timing-2026-09-30/cold-click.json) ·
[Cold CSV](evidence/click-timing-2026-09-30/cold-click.csv) ·
[Recorded workspace](evidence/click-timing-2026-09-30/live-workspace.png)

The first UI run exposed an invalid empty readiness timestamp during preparation.
The status now returns null until readiness exists, with a schema regression
check. The later warm run also includes full session metadata and binds the DOM
commit to the exact response revision. The cold export predates those additive
fields; neither recorded timing has been changed.

The controller was stopped normally after both runs. Final inventory observations
are included separately; a pending receipt is not rewritten as completed cleanup.
No physical external-link click, installed Safari interception, or automatic
navigation release was measured.
