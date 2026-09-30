# AionGuard

**Inspect before exposure.**

AionGuard is a pre-navigation security checkpoint for external links. It holds navigation and inspects the destination inside an isolated, prepared Solari sandbox before the user's authenticated browser visits it.

## Controlled intercepted-click test

**Normal browser: 4 destination HTTP requests. Protected browser: 0. Warning in 1.98 s.**

In one controlled comparison against our owned phishing fixture, a normal Chromium click generated four destination HTTP requests. With AionGuard intercepting the same click, the protected browser generated zero while Solari inspected the page remotely and returned a warning. The sandbox was prepared before the click, and navigation stayed held.

**Warm Solari inspection: 1.41 s median · 1.49 s P95 · n=20**

These are separate backend inspection measurements on one controlled fixture, excluding preparation.

**Reviewer quick path — 30-second review:** [original demo (Vercel)](#watch-the-original-demo) → [controlled-click evidence](docs/controlled-click.md) → [warm latency](docs/warm-solari.md) → [reproduce](docs/controlled-click.md#reproduce).

[Release v1.2.0](https://github.com/EXO-Robotics/AionGuard-Solari/releases/tag/solari-submission-v1.2.0) — frozen source and evidence package.

![Measured controlled-click comparison: normal click sends 4 destination HTTP requests; the protected browser sends 0. Warning in 1.98 seconds in one prepared-sandbox run.](docs/assets/controlled-click.svg)

## Submission verification

**Frozen v1.2.0: 388 tests passing · [GitHub CI passing](https://github.com/EXO-Robotics/AionGuard-Solari/actions/workflows/ci.yml) · [JSON/CSV click evidence](docs/evidence/controlled-click-2026-09-30) · [Zero remaining AionGuard resources in ten post-run inventories](docs/evidence/controlled-click-2026-09-30/post-run-inventory.json)**

The checks cover the detector, controller, advisory restrictions, click handoff, and sandbox lifecycle. Chromium NetLog and DevTools independently agreed on the request counts. [Verification record](docs/package-verification.md)

## Check, then continue

**No warning signs detected → open. Findings → block. Incomplete check → review.**

The new live Chromium pair opened the benign page in **2.27 s** and blocked the phishing page in **1.78 s**, with **zero protected-browser destination requests** for the phishing click. One prepared-sandbox run per page. [Results and reproduction](docs/link-release.md).

Current implementation: **434 tests passing**. The v1.2.0 release above remains frozen.

## From hackathon to click checkpoint

AionGuard started at the **OpenAI Astra Hackathon in New York**, using Vercel Sandbox. We then rebuilt the isolation layer around Solari and measured what it would take to put inspection directly in the click path.

Cold browser preparation took about **37 seconds**. Preparing the environment ahead of time brought inspection down to about **1.4 seconds**, making a pre-navigation checkpoint worth pursuing.

## Inspection pipeline

![Conceptual AionGuard flow: click, hold, inspect in a prepared Solari sandbox, and show a warning while navigation stays held.](docs/assets/inspect-before-exposure.png)

1. **Hold navigation.** The controlled Chromium extension intercepts the registered link and keeps the destination out of the local browser.
2. **Acquire a prepared Solari VM.** The controller sends the destination to an environment that is already ready.
3. **Open a fresh remote browser.** The page loads inside the sandbox and produces rendered-page evidence.
4. **Run deterministic detectors.** Five checks look for credential phishing, external password forms, executable-download lures, tech-support scams, and ClickFix command prompts.
5. **Decide and continue.** Findings block the link. A completed live check with no findings opens the inspected destination. An incomplete or failed check stays held for review. Findings and a screenshot remain in the receipt.
6. **Retire on a finding.** A flagged VM is retired and a replacement is prepared. Checks without findings can reuse the prepared VM.
7. **Escalate optionally to Astra.** [Advisory review](docs/astra-review-benchmark.md) runs separately from the fast path and cannot authorize navigation or take actions.

## Why Solari?

Solari provides the sandbox lifecycle behind the checkpoint: prepare ahead, inspect in a fresh browser, reuse the VM between checks, and replace it after a finding. Keeping browser setup out of the click path is what makes the measured latency useful.

![Twenty measured backend inspections in a prepared Solari sandbox](docs/assets/warm-latency.svg)

[Full timings, preparation cost, and lifecycle evidence](docs/warm-solari.md)

Solari is our preferred provider for speed and convenience. Provider adapters keep the inspection layer separate from the execution substrate.

## Current scope

This is a controlled Chromium prototype for registered test pages. The current branch supports **check → open** when a live inspection completes with no findings, **block** when warning signs are found, and **review** when the check cannot complete. “No warning signs detected” is a background-check result, not a safety guarantee. [Release behavior and reproduction](docs/link-release.md). General browser deployment, hostile-page containment, and automatic provider fallback remain future work. The [evaluation corpus](docs/benchmark.md) includes misses and false positives; the timing results do not establish real-world detection accuracy. [Detailed click-test scope](docs/controlled-click.md#scope)

## Watch the original demo

[▶ Watch the 56-second hackathon demo](https://www.youtube.com/watch?v=UJkPWHyTg-U)

Recorded with **Vercel Sandbox at the OpenAI Astra Hackathon in New York**. The Solari implementation and measurements are documented above.

## Try it

Use Node 24 LTS:

```sh
git clone https://github.com/EXO-Robotics/solari-cookbook.git
cd solari-cookbook/applications/aionguard
npm ci
npm run build
cp .env.example .env
```

For a preview without cloud credentials, set `AIONGUARD_MODE=MOCK` in `.env`, run `npm start`, and open **http://127.0.0.1:4317**. Connect using the private token in `runtime-data/controller-token`.

For live inspections against your own harmless test page, follow the [Solari setup guide](docs/quickstart.md). Credentials stay in the local controller.

[Official Solari fork](https://github.com/EXO-Robotics/solari-cookbook/tree/main/applications/aionguard) · [Full submission record](docs/solari-submission.md) · [Run the checks](docs/quickstart.md#checks) · [Presentation kit](docs/presentation.md)

MIT licensed.
