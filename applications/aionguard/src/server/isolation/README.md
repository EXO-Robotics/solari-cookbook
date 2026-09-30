# Bounded inspection adapter

`VercelInspector` takes an explicit registry, clean-snapshot approval, scoped provider credentials, and deadlines. `inspect()` accepts only `acme-login`; the administrator's registry resolves its URL. Missing configuration returns `UNAVAILABLE` without creating infrastructure. `createMockInspector()` is a separate software-verification implementation whose results are always labeled `MOCK`.

Every admitted LIVE inspection calls `Sandbox.create()` with a unique name, the approved snapshot, `persistent: false`, no exposed ports, no guest credentials, and an egress policy already attached. It never resumes or reuses a visited VM. The provider firewall restricts allowed hostnames and pins the HTTP Host header. The worker separately allows only HTTPS GET/HEAD requests on exact navigation origins and within the registered URL's containing directory. Legacy root fixtures retain origin-wide asset access. These controls do not claim path enforcement by the provider hostname firewall.

Live acceptance found that the provider rejects IPv6 subnet CIDRs. The adapter therefore denies private IPv4 ranges in the provider policy and disables IPv6 inside each disposable guest using `sysctl` before starting Chromium. If that guest-only command fails, inspection is unavailable and Chromium is never started. No host Mac network settings are changed.

The trusted worker starts a fresh Chromium context with page JavaScript disabled, service workers blocked, and downloads disabled. It observes bounded displayed text, the declared password/form surface, observed redirects, and an inert PNG. It checks that metadata and screenshot belong to the same document navigation. It does not enter credentials, submit forms, follow arbitrary actions, or evaluate the page's JavaScript network behavior. The owned fixture disables submission and points at a reserved `.invalid` destination.

The controller validates the structured result, URL policies, observed time, normalized declared form origin, and PNG envelope before accepting it. These are validations of output from the approved worker and snapshot, not independent cryptographic attestation of a compromised worker. The snapshot approval record is an explicit operator declaration with a source revision and browser pin.

VM admission is synchronous and defaults to one slot, capped at five including cleanup. Navigation, process, API operations, and VM lifetime have deadlines. Stop is attempted before deletion. A slot is released only after terminal stop status and successful deletion. An ambiguous creation response or missing cleanup confirmation remains visible through `outstandingCleanups()` and prevents capacity reuse. An outage returns no invented page evidence. Expiry is a backstop rather than terminal-state proof.

The runtime state is in memory. After an unclean controller shutdown, reconcile outstanding provider resources independently before starting another LIVE session; restarting the process is not cleanup. No live quotas or device protection are inferred from software tests.

## Configuration and clean-image preparation

The lead-owned runtime loads a JSON record and passes it to `inspectorConfigFromEnv(env, record)`. Required environment values are `AIONGUARD_VERCEL_SNAPSHOT_ID`, `AIONGUARD_FIXTURE_URL` (exact HTTPS URL, or legacy `AIONGUARD_FIXTURE_ORIGIN` resolving to `/acme-login.html`), `AIONGUARD_IDP_ORIGINS` (comma-separated exact HTTPS origins), and either the explicit `VERCEL_TOKEN`/`VERCEL_TEAM_ID`/`VERCEL_PROJECT_ID` triplet or `VERCEL_OIDC_TOKEN`. The IdP inventory is separate from the navigation allowlist. Optional deadline variables are named in `config.ts`; region is bounded to `iad1`.

`prepare-image.ts` is an explicit administrative command, excluded from installation, tests, and CI. It requires provider credentials (including a project-scoped OIDC token from official `vercel env pull`), an output path that does not already exist, and `AIONGUARD_IMAGE_BUILD_CONFIRM=CREATE_CLEAN_IMAGE`. It creates a clean Node 24 microVM, installs pinned Playwright 1.58.2 and Chromium dependencies, checks Chromium on `about:blank`, removes Internet egress, and snapshots before any inspected content or guest credentials are introduced. The record binds the Git base revision, actual recipe SHA-256, and whether tracked source changes existed; unrelated local artifacts are never uploaded. The resulting private candidate has `approvedAt: null`; LIVE dispatch rejects it until reviewed approval is supplied. The script preserves the clean snapshot for one day and deletes its stopped build VM. No historical probe images or scripts are reused.

Current compatibility and provider semantics were checked against the installed `@vercel/sandbox` 3.2.2 source and [SDK reference](https://vercel.com/docs/sandbox/sdk-reference), [firewall documentation](https://vercel.com/docs/sandbox/concepts/firewall), and [Playwright release](https://github.com/microsoft/playwright/releases/tag/v1.58.2). On September 10, 2026 the clean-image build and two sequential owned-fixture inspections passed on the verified Hobby account: unique sessions, real 1280 × 900 screenshots and expected observations, stop/delete confirmation, and an independently empty final inventory. The first rejected IPv6-policy attempt remains in the private receipt directory. This is provider acceptance; Safari interception and Astra integration have separate checks.

To repeat this bounded acceptance after reviewing the currently authorized fixture and snapshot, use:

```sh
AIONGUARD_LIVE_VERIFY_CONFIRM=INSPECT_OWNED_FIXTURE node --env-file=runtime-data/.env --import tsx scripts/verify-live-inspector.ts runtime-data/live-inspector-<unique-run>.json
```

The script makes two sequential live inspections, preserves PNGs and a receipt, rejects unregistered input without dispatch, and checks project inventory before and after. It requires a unique output path. OIDC credentials and snapshot expiration must be refreshed when they expire; never publish `runtime-data/.env` or raw credentials.

For the current dedicated test project, refresh through the supported CLI into a separate private file, so existing controller configuration is preserved:

```sh
npx vercel@59.15.1 env pull ../vercel-oidc.env --environment development --yes --cwd runtime-data/vercel-fixture
chmod 600 runtime-data/vercel-oidc.env
node --env-file=runtime-data/.env --env-file=runtime-data/vercel-oidc.env --import tsx src/server/main.ts
```

The later env file supplies fresh OIDC. Refreshing OIDC does not renew the clean snapshot: build a new candidate after its one-day expiration, review it, then update the private snapshot ID and approval path. The latest recorded preflight at 18:23:43 UTC September 10 reported snapshot expiry at 16:41:20 UTC September 11 and OIDC expiry at 04:26:17 UTC September 11. These are observations, not a substitute for a fresh provider check. A missing or expired resource yields unavailable; no new VM image is silently created.

The AionPhish fixture is an inert authentication-themed page. The worker reports its observed `AIONPHISH` brand separately from `ACME`; absent or ambiguous supported branding is `UNKNOWN`. Disabled password inputs and declared form destinations are observations, not evidence that credentials were entered or sent. Guest page JavaScript remains off, so animation may be absent from the inspection image. The guest worker permits GET/HEAD only within the registered URL’s containing directory, and returned final URLs and redirect evidence are checked against that same boundary. Legacy root fixtures retain their original whole-origin asset scope. Provider network filtering remains hostname-based; directory enforcement is performed by the browser worker and evidence validator. Safari interception rules separately use the registered project path.

Final AionPhish source checks passed 263 tests across 14 files, TypeScript, production build, formatting, and diff checks. Its installed Safari expiry and physical armed `0000` checks each observed rules disappear and a matching native acknowledgment after the production port was retained. These device checks created no inspection VM or model call and did not navigate to the protected destination. The earlier live Vercel/Astra receipts remain evidence for the original fixture only; an end-to-end AionPhish inspection remains pending.
