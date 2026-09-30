> This page documents the earlier synthetic Vercel workflow. Current Solari detector setup is in the [README](../README.md) and [submission record](solari-submission.md).

# Run the core application

Use Node 24 LTS and npm. The lockfile is the dependency authority. No external account is required for the explicit software-check mode.

```sh
npm ci
npm run check
npm run build
AIONGUARD_MODE=MOCK npm start
```

Open `http://127.0.0.1:4317`. The controller generates separate private random tokens at `runtime-data/controller-token` and `runtime-data/entry-token` if they are not supplied through environment. Read the controller token locally and paste it into the operator connection field. Do not commit, share, or put either token in a URL. The UI stores the operator token in that tab's session storage. Runtime artifacts and tokens are gitignored; generated token files have mode 0600.

Create an attempt, record the synthetic scope authorization, and use **Run software check**. This mode calls no Vercel or Astra service. The mock inspector returns a minimal test PNG and fixed inspection metadata; the mock planner uses the declared coverage policy. The interface and exported receipt label both modes MOCK.

After investigation, **Apply authorized change** preserves the baseline and creates a new revision with verification required. **Verify fresh state** performs the separate paid synthetic collection. A failed or unaffordable check preserves the gap. New attempts have new ledgers; they do not refill old attempts. Up to 25 attempts are retained in memory. Export receipts before stopping the server. Restarting loses cases and does not prove any remote resources were cleaned up.

`npm run dev:ui` runs the optional Vite frontend on `127.0.0.1:5173` and proxies API calls to the controller. Run the controller separately. `npm start` serves the built frontend and the API together. The controller always binds to IPv4 loopback; it is not an Internet-facing or multi-instance deployment.

## Live configuration

Copy `.env.example` to `.env` for a new installation. On the intended Mac, `.env` points to the private official Vercel export at `runtime-data/.env`; the app loads it through `AIONGUARD_VERCEL_ENV_PATH`. LIVE is the default and fails closed when configuration is missing. The application does not silently substitute mock providers.

Configuration requirements:

1. Set `AIONGUARD_FIXTURE_URL` to the exact owned HTTPS target, such as `https://mfrey18.github.io/AionPhish/`, and configure an exact approved IdP-origin inventory. Legacy `AIONGUARD_FIXTURE_ORIGIN` still resolves to `/acme-login.html`; if both values are supplied their origins must match. Use the same target when building the extension. Only the registered `acme-login` ID crosses the entry API; the controller resolves the destination.
2. Prepare and review a new clean browser snapshot with the guarded [image preparation source](../src/server/isolation/prepare-image.ts). The script is not invoked by installation, tests or CI. Set the matching snapshot ID and approval-record path. See [isolation configuration](../src/server/isolation/README.md).
3. Supply explicit Vercel credentials or the supported OIDC alternative. Credentials stay in the controller, outside guest and model environments. Observe free-account usage; pause when the allowance is exhausted or unavailable. No script upgrades the account.
4. Configure `ASTRA_CLI_PATH` for a supported Codex executable authenticated through its own CLI login. The verified preflight path on the intended Mac was `/Applications/Codex.app/Contents/Resources/codex`; the older global executable was incompatible with Astra. The application does not read or export CLI session tokens.
5. Generate and package the [Safari extension source](../src/extension/README.md). Give its settings only the separate entry token. Set `AIONGUARD_EXTENSION_ORIGINS` to the installed extension's exact origin if Safari sends an Origin header. The controller canonicalizes the case of complete Safari UUID or Chrome extension origins; another extension identity, a wildcard, path, query, port, or arbitrary website is rejected. Do not give the extension the full controller token.
6. Start the passive keyboard helper using the [recovery setup](../src/extension/recovery/README.md), or use `npm run start:protected` to start the configured controller and recovery app together. It never arms automatically. Authorize a READY case, then explicitly arm a two-minute test lease in the operator UI. The extension entry request can use only that case. Missing authorization returns 409. The arm command selects an already authorized READY attempt; emergency release revokes that selection and a later test requires explicit rearming. Earlier attempts remain preserved.

The original fixture, clean snapshot, three actual Astra comparison variants and two complete live HTTP cases are verified in [the integration record](integration-verification.md). The installed, paired AionPhish package has a one-day Safari website-access grant for `https://mfrey18.github.io`; that permission covers the origin, while its rules cover the registered project path. After retaining the production native port, a repeated 20-second expiry test and the user's physical `0000` from TextEdit while armed each ended with empty rules and a fresh matching native acknowledgment. Inspector was closed during the physical input; the acknowledgment preceded the lease deadline by approximately 95.5 seconds. Protection is off. The earlier failed attempts remain recorded. External click/Safari interception and the Secure Input, suspension, restart, and controller/helper-loss matrix remain unverified. Presentation work remains deferred.

`npm run accept:live` explicitly spends live Vercel/Astra usage on two authenticated HTTP cases against the running controller. It requires a genuinely ready recovery helper, does not fabricate its heartbeat, checks fresh post-change verification, exports source-hashed receipts, and disarms in cleanup. Run it only after configuring the controller and independently qualifying keyboard recovery. It does not prove Safari interception.

Before restarting after an unclean LIVE shutdown, reconcile the prior session's Vercel resources independently. A new process cannot recover the old in-memory cleanup reservations. `VercelInspector.outstandingCleanups()` exposes pending work for a running process; unresolved stop/deletion retains capacity. Automatic expiry is only a backstop.

## Independent planner comparison

```sh
npm run compare
```

This runs greedy and coverage-aware baselines from independent copies of the three frozen scenarios and writes an append-only JSON report under `runtime-data/comparisons/`. No model or Vercel request occurs. Each row records the initial-state hash, scenario/action/policy versions, action sequence, supported outcomes, budget, verification capacity, latency and adaptation checks.

The command also updates `runtime-data/comparison-latest.json`, a display copy; timestamped source reports remain unchanged. On startup the controller loads that copy, or `AIONGUARD_COMPARISON_PATH`. The compact UI comparison appears only when initial-state hash, scenario, action-contract and policy versions match the case. It is labeled precomputed offline and never supplies case observations. Restart the controller to load a newly generated report.

For an explicitly requested live model evaluation:

```sh
npm run compare -- --live-astra
```

The flag adds real Astra attempts through the configured CLI. It does not reroll or replace a failed model. All attempted rows are retained. Small fixture results do not establish general superiority. Unsupported assertions in model rationale require human semantic review; the report marks that metric unmeasured. Comparison observations never enter another run or a live case.

## API boundary

Every API route except the small health response requires a bearer token; static UI files do not contain secrets. Reads require the operator token too. Exact Host/Origin validation, JSON-only strict command schemas, 8 KiB request limits, no-store responses and a restrictive content policy protect the loopback surface. CORS is not authentication and does not prevent an authorized local process from using a stolen token. The controller remains a trusted administrative authority.

| Route | Authority | Purpose |
| --- | --- | --- |
| `GET /api/health` | none | Mode/version and software availability only |
| `GET/POST /api/attempts` | operator | List or create independent attempts |
| `GET /api/attempts/:run` | operator | Validated snapshot |
| `POST /api/attempts/:run/authorize` | operator | Record exact synthetic scenario/change scope |
| `POST /api/entry` | entry token | Hand off registered fixture while a protection lease and authorized case are armed |
| `GET /api/protection` | operator, entry, or recovery | Lease/readiness and reported Safari removal acknowledgment |
| `POST /api/protection/arm` | operator | Select authorized READY case and arm a bounded lease |
| `POST /api/protection/disarm` | operator, entry, or recovery | Revoke lease; optional request ID binds the removal acknowledgment |
| `POST /api/protection/heartbeat` | recovery only | Native helper readiness; loss revokes the lease |
| `POST /api/protection/extension-ack` | entry only | Report removal for the matching current release ID |
| `POST /api/attempts/:run/software-check` | operator, MOCK only | Local software verification path |
| `POST /api/attempts/:run/continue` | operator | Request more bounded planning |
| `POST /api/attempts/:run/harden` | operator | Exact synthetic change, without claiming verification |
| `POST /api/attempts/:run/verify` | operator | Paid fresh after-state check |
| `GET /api/attempts/:run/receipt` | operator | Source-referenced receipt export |
| `GET /api/attempts/:run/comparison` | operator | Matching display-only precomputed metrics |
| `GET /api/attempts/:run/image` | operator | Validated inert PNG only |

The receipt digest binds the JSON body excluding its `digest` field, serialized in export field order. It is a SHA-256 content hash, not an independent signature or attestation.
