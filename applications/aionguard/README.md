# AionGuard

**Inspect before exposure.**

AionGuard is a pre-navigation security checkpoint for external links. It holds navigation and inspects the destination inside an isolated, prepared Solari sandbox before the user's authenticated browser visits it.

## Controlled intercepted-click test

**4 → 0 destination HTTP requests from the local browser · 1.98 s click → warning**

In one controlled comparison against our owned phishing fixture, a normal Chromium click generated four destination HTTP requests. With AionGuard intercepting the same click, the protected browser generated zero while Solari inspected the page remotely and returned a warning. The sandbox was prepared before the click, and navigation stayed held.

**Warm Solari inspection: 1.41 s median · 1.49 s P95 · n=20**

These are separate backend inspection measurements on one controlled fixture, excluding preparation.

[Watch the original demo](#watch-the-original-demo) · [Controlled-click evidence](docs/controlled-click.md) · [Reproduce](docs/controlled-click.md#reproduce) · [Release v1.2.0](https://github.com/EXO-Robotics/AionGuard-Solari/releases/tag/solari-submission-v1.2.0)

![Conceptual AionGuard flow: click, hold, inspect in a prepared Solari sandbox, and show a warning. Measured results: 4 versus 0 local destination HTTP requests and 1.98 seconds from click to warning in one controlled comparison.](docs/assets/inspect-before-exposure.png)

## Submission verification

**388 tests passing · [GitHub CI passing](https://github.com/EXO-Robotics/AionGuard-Solari/actions/workflows/ci.yml) · [JSON/CSV click evidence](docs/evidence/controlled-click-2026-09-30) · [Zero remaining AionGuard resources in ten post-run inventories](docs/evidence/controlled-click-2026-09-30/post-run-inventory.json)**

The checks cover the detector, controller, advisory restrictions, click handoff, and sandbox lifecycle. Chromium NetLog and DevTools independently agreed on the request counts. [Verification record](docs/package-verification.md)

## From hackathon to click checkpoint

AionGuard started at the **OpenAI Astra Hackathon in New York**, using Vercel Sandbox. We then rebuilt the isolation layer around Solari and measured what it would take to put inspection directly in the click path.

Cold browser preparation took about **37 seconds**. Preparing the environment ahead of time brought inspection down to about **1.4 seconds**, making a pre-navigation checkpoint worth pursuing.

## Inspection pipeline

1. **Hold navigation.** The controlled Chromium extension intercepts the registered link and keeps the destination out of the local browser.
2. **Acquire a prepared Solari VM.** The controller sends the destination to an environment that is already ready.
3. **Open a fresh remote browser.** The page loads inside the sandbox and produces rendered-page evidence.
4. **Run deterministic detectors.** Five checks look for credential phishing, external password forms, executable-download lures, tech-support scams, and ClickFix command prompts.
5. **Return evidence.** Findings and a screenshot come back to the controller; the browser displays the warning.
6. **Retire on a finding.** A flagged VM is retired and a replacement is prepared. Checks without findings can reuse the prepared VM.
7. **Escalate optionally to Astra.** [Advisory review](docs/astra-review-benchmark.md) runs separately from the fast path and cannot authorize navigation or take actions.

## Why Solari?

Solari provides the sandbox lifecycle behind the checkpoint: prepare ahead, inspect in a fresh browser, reuse the VM between checks, and replace it after a finding. Keeping browser setup out of the click path is what makes the measured latency useful.

![Twenty measured backend inspections in a prepared Solari sandbox](docs/assets/warm-latency.svg)

[Full timings, preparation cost, and lifecycle evidence](docs/warm-solari.md)

Solari is our preferred provider for speed and convenience. Provider adapters keep the inspection layer separate from the execution substrate.

## Current scope

This is a controlled Chromium prototype for owned test pages. Navigation stays held, including when no detector fires: **no findings does not mean safe**. General browser deployment, policy-controlled release, hostile-page containment, and automatic provider fallback remain future work. The [evaluation corpus](docs/benchmark.md) includes misses and false positives; the timing results do not establish real-world detection accuracy. [Detailed click-test scope](docs/controlled-click.md#scope)

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
