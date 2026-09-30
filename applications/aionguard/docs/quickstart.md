# Run AionGuard

Use Node 24 LTS and follow the README install commands. The controller runs locally at `http://127.0.0.1:4317`.

## Preview without credentials

Set `AIONGUARD_MODE=MOCK` in `.env`, then `npm start`. Connect with the token in `runtime-data/controller-token`. This is a software preview; the interface labels its evidence MOCK.

## Use Solari

Add these values to your private `.env`:

```dotenv
AIONGUARD_MODE=LIVE
AIONGUARD_PROVIDER=SOLARI
AIONGUARD_WORKFLOW=DETECTOR
AIONGUARD_SOLARI_SESSION=WARM
SOLARI_API_KEY=your-private-key
AIONGUARD_FIXTURE_URL=https://your-owned-host.example/demo/
AIONGUARD_IDP_ORIGINS=https://your-trusted-login.example
```

Alternatively, set `AIONGUARD_SOLARI_ENV_PATH` to an existing private env file containing `SOLARI_API_KEY`. Never commit credentials or `runtime-data/`. Never prefix a secret with `VITE_`.

Run `npm start`, connect with the private controller token, and wait for **Solari sandbox ready**. Create an inspection, confirm authorization for your owned fixture, and choose **Inspect registered URL**. Export the receipt afterward.

The controller prepares one sandbox at startup. Checks with no findings reuse its VM but start a fresh browser process. Findings or errors retire it; a replacement prepares after cleanup reconciliation. Cold preparation still takes time, so a click before readiness waits.

Only one check runs at a time. Default limits are two minutes idle, four minutes total age, and 100 inspections. Unresolved cleanup blocks replacement. Stop the controller normally so it can clean up. After interruption, preserve and reconcile its ownership journal; see [lifecycle details](warm-solari.md).

`AIONGUARD_SOLARI_SESSION=FRESH` selects one VM per inspection. The historical Vercel/synthetic path has separate credentials and snapshot requirements described in the [inspector guide](../src/server/isolation/README.md).

## Checks

```sh
npm run check
npm run format:check
```

Optional live commands use your configured provider and can consume credits:

```sh
npm run qualify:solari
npm run qualify:detectors
npm run qualify:warm -- --live --runs 20 --output runtime-data/warm-qualification-new
```

The first checks your configured owned URL; the second checks six inert rule fixtures. The warm qualification is specifically scoped to the owned AionPhish demo and deliberately calibrates trust to test reuse. It is not a real-world detection test.

For the optional read-only Astra timing harness, see [Astra review](astra-review-benchmark.md). Select your installed CLI with `AIONGUARD_CODEX_PATH` if needed; it sends only structural fields to the model service.

The default detector never invokes Astra or changes an external system. No-match results remain undetermined. Browser routing restrictions are not proof of a provider-level egress firewall. Use harmless owned fixtures only.

## Controlled browser click

The [controlled Chromium demonstration](controlled-click.md) runs one unprotected and one protected click in disposable profiles, using the owned fixture and real Solari. It records HTTP request counts and click-to-warning timing. It does not change your regular browser or automatically release links.
