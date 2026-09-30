# AionGuard × Solari

This is the runnable AionGuard application inside `EXO-Robotics/solari-cookbook`, a GitHub fork of `solari-sdk/solari-cookbook`. The [polished standalone submission](https://github.com/EXO-Robotics/AionGuard-Solari) remains the primary project presentation. This copy is derived from its verified commit `f540c2679730de29db557f3435d833d5d65425b8`; application source, tests and recorded evidence are unchanged.

**Inspect a suspicious link in Solari. Show the warning signs and the evidence.**

[Submission and verification](docs/solari-submission.md) · [Download the release](https://github.com/EXO-Robotics/AionGuard-Solari/releases/latest) · [Six-case detector evidence](docs/evidence/solari-2026-09-29/synthetic-fixtures.json)

![AionGuard showing a live Solari inspection and its finding](docs/evidence/solari-2026-09-29/detector-ui.png)

This is the standalone Solari submission edition of AionGuard, derived from tested candidate `4a2e6e876def9827f252acc2741d61ef93195348`. It is an independent repository with a reviewed source snapshot, rather than the original repository's private Git history.

AionGuard is a small, local web-threat detector backed by a fresh Solari sandbox. It inspects one administrator-registered, owned demo URL, captures the page with scripts disabled, and explains which of five deterministic rules matched. The local VM is outside this submission.

| Detector | Observed warning sign |
| --- | --- |
| Credential phishing | A password field on an origin outside the trusted-login list |
| External password form | A password form targeting an unapproved external origin |
| Executable download lure | An executable link paired with update or urgency language |
| Tech-support scam | Urgent infected-device warnings plus contact-support instructions |
| ClickFix | Verification or repair instructions asking the visitor to run an OS command |

These are five practical heuristics, not a ranked list of the world's most common attacks. They can produce false positives and miss attacks. **No matches means undetermined, never safe.** The detector does not execute page scripts, enter credentials, download payloads, or claim that compromise occurred.

## Run

Use Node 24 LTS:

```sh
git clone https://github.com/EXO-Robotics/solari-cookbook.git
cd solari-cookbook/applications/aionguard
npm ci
npm run check
npm run build
cp .env.example .env
```

For a software-only preview, set `AIONGUARD_MODE=MOCK` in `.env` and run `npm start`. No provider calls occur. The screen identifies mock evidence.

For Solari, set these private values in `.env`:

```dotenv
AIONGUARD_MODE=LIVE
AIONGUARD_PROVIDER=SOLARI
AIONGUARD_WORKFLOW=DETECTOR
SOLARI_API_KEY=your-private-key
AIONGUARD_FIXTURE_URL=https://your-owned-host.example/demo/
AIONGUARD_IDP_ORIGINS=https://your-trusted-login.example
```

Alternatively set `AIONGUARD_SOLARI_ENV_PATH` to an existing private env file containing `SOLARI_API_KEY`. Never use a `VITE_` prefix for credentials. Do not commit `.env` or `runtime-data`.

Run `npm start`, open `http://127.0.0.1:4317`, and connect using the private token in `runtime-data/controller-token`. Create an inspection, confirm authorization for the registered owned fixture, then select **Inspect registered URL**. Export its receipt afterward. The token stays local; Solari credentials remain in the server.

The first browser setup in each fresh sandbox may take up to a few minutes. Only one inspection can run at a time. Unresolved cleanup consumes that slot. Cases are held in memory; export before stopping the controller. After an interrupted process, reconcile that process's tagged Solari resources before restarting.

## What this submission proves

The September 29 candidate has live Solari inspection evidence against the owned AionPhish demo: page observation, screenshot, a phishing heuristic finding and confirmed resource cleanup. See [the submission record](docs/solari-submission.md) for exact checks, failures and remaining limits.

The bare-bones UI initiates direct remote inspection. It does **not** prove Safari interception or suppression of local requests. It accepts a fixed administrator-owned URL, not arbitrary public URLs. Network restrictions are browser routing rules; no Solari infrastructure egress firewall has been qualified. Use harmless owned fixtures only.

The default detector stops after classification. It does not invoke Astra or execute synthetic organizational changes. Astra incident response, IT notifications, Tripwire, continuity, general browsing protection and production-scale operation are outside this submission.

## Checks and evidence

```sh
npm run check
npm run format:check
# Explicit live provider usage; supply the private environment first:
npm run qualify:solari
npm run qualify:detectors
```

The first live command inspects the configured owned URL. The second checks six inert synthetic HTML fixtures inside a Solari browser; it tests extraction and all five rules, not real-world detection accuracy. Neither is a Safari acceptance test.

[Original Vercel integration evidence](docs/integration-verification.md), [historical submission](docs/submission.md), and [planning](docs/planning/plan.md) remain available with their original provider identity. `AIONGUARD_PROVIDER=VERCEL` and `AIONGUARD_WORKFLOW=SYNTHETIC` retain the earlier experimental path; it requires its separate credentials, snapshot approval and setup.

MIT licensed. Provider services retain their own terms.
