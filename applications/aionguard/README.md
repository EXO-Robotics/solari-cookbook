# AionGuard

**Inspect before exposure.**

A background check for links before they open on the devices that matter most.

AionGuard holds a link, opens the destination in a prepared Solari sandbox, and checks the page for warning signs before your browser visits it. When no warning signs are detected, it opens the page. When it finds warning signs, it keeps the link blocked and shows why. If the check cannot complete, keep the link held for review.

**Check remotely. Continue locally. Keep the evidence.**

## See it work

The current prototype demonstrates both sides of the checkpoint in controlled Chromium tests:

| Link | What happens | Measured result |
| --- | --- | --- |
| Owned benign page | Inspect, then open in the protected browser | **2.27 s** click → page loaded |
| Owned phishing page | Inspect, block, and show a warning | **1.78 s** click → warning; **0 destination HTTP requests** from the protected browser |
| Failed or incomplete inspection | Hold for review or retry | No automatic opening |

One prepared-sandbox run per page; these timings are controlled results, not detection-accuracy claims. [Results, evidence, and reproduction](docs/link-release.md).

**Warm Solari inspection: 1.41 s median · 1.49 s P95 · n=20.** Separate backend measurements on one controlled fixture, excluding preparation.

**Reviewer quick path — 30-second review:** [original demo (Vercel)](#watch-the-original-demo) → [open/block evidence](docs/link-release.md#measured-live-result--september-30-2026) → [warm latency](docs/warm-solari.md) → [reproduce](docs/link-release.md#reproduce-the-live-browser-pair).

![Earlier controlled-click comparison: normal click sends 4 destination HTTP requests; the protected browser sends 0. Warning in 1.98 seconds in one prepared-sandbox run.](docs/assets/controlled-click.svg)

The graphic shows the earlier [baseline comparison](docs/controlled-click.md): the same phishing link produced **4 destination requests normally, versus 0 with AionGuard**. The newer open/block results above extend that demonstration.

## The app: SolariGuard

**SolariGuard is our proposed product direction for AionGuard:** a downloadable link-checking app powered by a customer's Solari subscription.

The intended experience is simple:

1. **Install the client** on a device used for sensitive work—such as a founder's laptop, an administrator's workstation, or a finance team's computer.
2. **Connect a Solari account** to run inspections away from that device.
3. **Enable link checks.** The client keeps a sandbox prepared, checks destinations before opening them, and shows a screenshot and findings when it catches warning signs.

This could become an optional security app for Solari customers: a practical use for their cloud sandboxes directly in everyday browsing. AionGuard supplies the open-source inspection and navigation controller; Solari supplies the remote execution environment.

**Available today:** the source, local dashboard, and controlled Chromium open/block/review demonstration. A signed everyday-use client, general browser coverage, and subscription onboarding are the next product steps. SolariGuard is a proposed name and integration, not an announced Solari feature or an included subscription benefit.

## Built for links you would rather check first

The useful moment is an unexpected link in an email, message, or document—especially on a device with access to important accounts and work. AionGuard gives that destination a remote inspection before letting it run in the protected browser.

The result is a background check, not a safety certificate. **“No warning signs detected” means exactly that.** The app can let browsing continue without claiming that its five detectors know every attack.

## From hackathon to click checkpoint

AionGuard started at the **OpenAI Astra Hackathon in New York**, using Vercel Sandbox. We then rebuilt the isolation layer around Solari and measured what it would take to put inspection directly in the click path.

Cold browser preparation took about **37 seconds**. Preparing the environment ahead of time brought inspection down to about **1.4 seconds**, making a pre-navigation checkpoint worth pursuing.

## Inspection pipeline

![Conceptual AionGuard flow: click, hold, inspect in a prepared Solari sandbox, and show a warning while navigation stays held.](docs/assets/inspect-before-exposure.png)

1. **Hold navigation.** The controlled Chromium extension intercepts the registered link and keeps the destination out of the protected browser.
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

## Engineering evidence

**434 tests passing** cover the detector, controller, navigation handoff, release authority, advisory restrictions, and sandbox lifecycle. [CI](https://github.com/EXO-Robotics/AionGuard-Solari/actions/workflows/ci.yml) · [JSON/CSV results](docs/evidence/link-release-2026-09-30) · [Zero remaining AionGuard resources in ten post-run inventories](docs/evidence/link-release-2026-09-30/post-run-inventory.json).

The [v1.2.0 submission release](https://github.com/EXO-Robotics/AionGuard-Solari/releases/tag/solari-submission-v1.2.0) remains frozen with its original 388-test verification and evidence. The open/block flow is available on the current branch. [Original verification record](docs/package-verification.md).

## Current scope

This is a controlled Chromium prototype for registered test pages. The current branch supports **check → open** when a live inspection completes with no findings, **block** when warning signs are found, and **review** when the check cannot complete. “No warning signs detected” is a background-check result, not a safety guarantee. [Release behavior and reproduction](docs/link-release.md). General browser deployment, hostile-page containment, and automatic provider fallback remain future work. The [evaluation corpus](docs/benchmark.md) includes misses and false positives; the timing results do not establish real-world detection accuracy. [Detailed click-test scope](docs/controlled-click.md#scope)

## Watch the original demo

[▶ Watch the 56-second hackathon demo](https://www.youtube.com/watch?v=UJkPWHyTg-U)

Recorded with **Vercel Sandbox at the OpenAI Astra Hackathon in New York**. The Solari implementation and measurements are documented above.

## Run the prototype

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
