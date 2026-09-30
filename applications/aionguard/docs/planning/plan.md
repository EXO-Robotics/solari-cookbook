> Public planning copy. Read [current build decisions](../build-decisions.md) first. Links to omitted historical material point to [publication notes](../planning-provenance.md); raw receipts remain in the original source bundle.

# AionGuard — final hackathon plan

Status: planning and pre-event capability evidence only. No AionGuard application has been built.

Target event: September 10, 2026. Planning updated September 9, 2026 for Vercel Sandbox: the controlled Apple Mail email-to-browser entry point is included in P0; Phase 1 investigation scope remains frozen; Phase 2 Tripwire is the first gated expansion; Phase 3 Verified Incident Continuity follows only if Phase 2 is complete and time remains. Sections 17–18 define this explicit order. Historical Solari POC results span September 7–8 EDT; Vercel qualification was measured September 9, 2026. Preserve each record’s original provider and timestamps. CLI is the planned Astra transport, and continuity uses a bounded between-jobs cutover.

## 1. Read this first

Build the application only after the organizer's permitted build period begins. Reading this plan is not an instruction to start implementation early. Do not create application scaffolding, extension code, product fixtures, UI assets, or a reusable product test harness before that period.

The accompanying evidence comes from disposable generic capability probes. Do not copy their scripts or specimens into the submission. The evidence bundle intentionally contains results and screenshots, not probe implementation. Clarify with organizers whether planning packs and pre-event capability checks are permitted; do not claim organizer approval already exists.

This is a standalone planning bundle. The hackathon application must be a new repository and in-event implementation. Do not modify, copy, merge or deploy SmartCart or PulseRange product code. Vercel tests used a separate disposable project and the existing private CLI login; arrange the intended event project and credentials without copying any product implementation.

Published event reference: https://cerebralvalley.ai/e/openai-gpt-6-astra-nyc

## 2. Product and success criterion

Name: AionGuard.

Category: Evidence-Governed Autonomous Security Investigation.

Plain-language thesis: AI investigates. Evidence decides.

Demo origin: a controlled phishing-like email in Apple Mail. No Mail integration or message inspection is claimed. Protection boundary: the registered HTTPS navigation entering the selected protected Safari profile. Demonstrated investigation: authorized assumed-compromise identity exposure.

Tagline: Challenge the path before you trust it.

Architecture: Vercel Sandbox isolates. Astra investigates. AionGuard verifies.

One-line pitch: AionGuard turns a protected click into a security investigation: Astra chooses what to inspect, evidence determines which exposure paths remain supported, and a defensive change requires fresh verification.

The main attraction is one normal click automatically becoming inspection, investigation, responder priority, and a verified defensive change. The planner comparison supports this story; it is not a separate product or dashboard.

Prove one controlled endpoint, one Apple Mail email-to-browser path, one protected Safari profile, one registered protected link, one case, one identity, two hypotheses, one four-credit ledger, and one synthetic defensive change. Do not claim fleet coverage, enterprise deployment, mail-gateway protection, universal email-client coverage, or general security assurance.

Phase 1 is the baseline submission target, not a guaranteed completed product. Phase 2 is Tripwire: correlate owned-lab decoy capture with independently observed attempted reuse. Phase 3 is Verified Incident Continuity: reconstruct approved essential work while its original environment remains restricted. Each expansion requires the previous phase to be a complete independently runnable release. Sections 4–15 specify Phase 1 unless stated otherwise; sections 17–18 define the only exceptions. Phase A/B are evidence domains inside PR-014, not the three delivery phases. Repair Lab remains excluded.

Preferred Phase 1 complete flow:

1. User opens the received controlled message in Apple Mail and clicks its registered HTTPS link normally.
2. The verified macOS handoff opens the protected Safari profile. A narrowly scoped extension blocks/redirects the original request to a trusted holding page before the destination loads locally.
3. The server resolves a registered fixture ID and launches a fresh remote Chromium instance in a Vercel Sandbox microVM.
4. Collectors return a PNG and structured observations from the owned inert fixture.
5. AUTH-01/02 produce SUSPICIOUS / BLOCK.
6. PR-014 is created automatically with the preauthorized synthetic assumed-compromise scenario.
7. Astra chooses bounded investigations; the broker enforces cost and authorization.
8. AionGuard dismisses a false critical path and retains a supported high-impact potential exposure.
9. The preauthorized synthetic CLI setting changes.
10. A fresh paid observation supports the separately evaluated after-state.
11. A source-referenced receipt preserves baseline and after-state.

This is the preferred measured outcome, not a scripted guarantee. Unexpected choices, missing evidence, exhausted budget, and provider failures must remain truthful results.

### Why this is different

The model controls investigation strategy, not the authoritative conclusion. Astra selects missing evidence worth acquiring. The broker controls authorized execution and spending. AionGuard evaluates observations against explicit prerequisites, preserves uncertainty and conflicts, and requires fresh evidence before reporting a verified after-state.

The click makes this mechanism tangible. It is the demonstrated entry point, not a claim that phishing classification is the entire future product. Do not claim this architectural separation is unique across the security industry or that a shared-source choice is impossible for a deterministic policy.

Winning strategy: make one complete mechanism visible, reliable and inspectable. Prioritize the real click, the evidence-driven critical-path dismissal, and the fresh verification over a claimed model victory. No placement or winning probability is established by the POC.

## 3. What the POC has established — Vercel qualification

Vercel Sandbox is the selected provider for this plan. The switch follows the user's report that Solari is expected to be unavailable through the hackathon; this is a planning input, not an independently verified outage forecast. E2B was considered but has no executed evidence because credentials were unavailable. Selecting Vercel here does not establish that it is faster or cheaper than E2B.

See [Vercel evidence](evidence/07-vercel-qualification/README.md), [readiness](poc-readiness.md) and [migration requirements](../planning-provenance.md#omitted-source-material). These are disposable generic provider/stock-service tests, not AionGuard implementation.

| Capability | Vercel evidence | Limit |
|---|---|---|
| Fresh microVM and Chromium per click | Corrected 30-run light-page batch: 20 sequential and two bursts of five; 30 distinct environments; initial cookies empty and prior-run marker absent | No running VM pool; behavioral freshness, not independent hypervisor proof |
| Returned-evidence latency | Sequential median VM creation 0.253 s; returned PNG/JSON median 2.913 s, sample p95 5.336 s; burst median returned evidence 2.635 s | Small samples from this Mac to iad1; not full Mail/Safari/Astra latency or a speed guarantee |
| Rich inspection | Two fresh runs: URL/title/text, password fields, exact absolute/relative form resolution, redirects, request observations and PNG | Owned harmless specimen; richer probe times 3.612/9.217 s include uploads and intentional faults, not optimized click timings |
| Browser faults | Expected blocked-by-client navigation error and timeout; cleanup | Integrated unavailable/block behavior still must be tested |
| POST/capture/replay | Real synthetic browser POST; independent captured bytes; separate-VM actor reads actual capture and sends it to a separate monitor; matching hashes; fresh repeat | No real attacker/employee compromise, Tripwire correlation engine or complete absence logic |
| Access boundaries | Stock nginx auth rejects anonymous/wrong-role access; actor cannot read monitor observations or access admin path | Preview URL alone is not private; shared orchestration account still controls all lab VMs |
| Capture/monitor faults | Missing/failed capture makes actor skip submission; stopped monitor returns an error, not empty success | Expiry, delayed ingestion, deduplication and product negative controls remain in-event work |
| Observed submission routing | Controlled form declares owned A, sends to owned B; request and receiver hashes agree, twice | Optional Phase 2 feature remains gated; not universal JavaScript/service-worker visibility |
| Egress enforcement | Same healthy owned endpoint allowed before policy, denied afterward; permitted endpoint stays healthy; Chromium and HTTP tested; deny-all blocks HTTP and DNS in bounded probes | Ordinary protocol tests, not adversarial bypass certification or physical-Mac quarantine |
| Source revocation | Continuing old client changes from 200 to 401 while service remains healthy; replacement allowed 200 and prohibited path 403 | Stock per-request service auth, not job cutover/state reconciliation or arbitrary session revocation |
| Actual fresh reconstruction workload | Identical hashed generic program executed in fresh replacements; 33 and 34 successful observations, no recorded failures; three fresh challenge cycles spanning 63.385 and 65.153 s | Stateless polling workload, not Release Coordinator jobs or accepted recovery |
| Files/processes | SHA-256 source round trip, background execution, nonzero exit/stderr, numeric terminal exit after kill, timed command stops with no delayed effect | No hard resource-exhaustion, malware or escape testing |
| Lifecycle | Explicit stop before delete; final inventories empty; feature snapshots deleted; execution-proven 10 s VM observed stopped by 13.9 s, separate probe by 16.1 s | Automatic expiry is a backstop, not an exact deadline |

The corrected main suite recorded 52 passing assertions, the stricter supplement 27; these include repeated/overlapping checks, not 79 distinct features. Preserve initial failures: unsupported old Playwright version, snapshot-expiry minimum, SDK working-directory mismatch, and delete-only capacity failures. Broader assertions are supported only within their observed scope; supplemental tests provide the stronger negative controls.

Earlier Solari evidence in folders 01–06 and the [historical final review](../planning-provenance.md#omitted-source-material) stays labeled Solari. Do not relabel its screenshots, timings, Astra-assisted reconstruction or provider recording failures as Vercel results. Existing generic Codex/Astra evidence does not prove the new integrated invocation. No new Astra call was required by Vercel runtime qualification.

No AionGuard end-to-end flow, actual Mail-to-Safari hold/dispatch, event-organizer approval, full security assurance or feature release has been demonstrated. Build-window integration and phase acceptance gates remain mandatory. Full browser recording/replay is optional and unqualified on Vercel; PNG plus structured observations are the required evidence.

## 4. Scope and run configuration

Use a TypeScript repository, React/Vite interface, a small long-lived Node server, runtime-validated shared contracts, one package manager, and one lockfile. Resolve actual compatible versions during kickoff. Keep the case store in memory. Restart/reset creates a new attempt; it must not silently refill an existing attempt's budget.

Do not deploy the in-memory runtime unchanged to a multi-instance/serverless service. A local demonstration is sufficient. The inert remote-inspection fixture needs a permitted reachable HTTPS origin; Vercel Sandbox does not share the laptop's localhost.

Expected server-only configuration:

- ASTRA_TRANSPORT: CLI by default; API only if dedicated event access is supplied
- ASTRA_CLI_PATH: configured supported Codex executable; verify its version and authenticated model access
- OPENAI_MODEL: configurable; planned model ID gpt-6-astra
- OPENAI_API_KEY: optional, server-only and required only for an explicitly selected API transport
- VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID: server-only explicit token authentication; never place these in guest environments
- VERCEL_OIDC_TOKEN: alternative supported authentication, not simultaneously required; refresh/verify its validity for the event
- AIONGUARD_VERCEL_SNAPSHOT_ID: approved clean event-built browser snapshot
- AIONGUARD_VERCEL_REGION: initially iad1, matching measured probes
- AIONGUARD_SANDBOX_TIMEOUT_MS and explicit process/navigation deadlines
- AIONGUARD_MAX_CONCURRENT_SANDBOXES: within verified account capacity, reserving room for cleanup and later phases
- distinct scoped collector/actor/monitor/worker credentials, resolved server-side and supplied only to the relevant guest
- AIONGUARD_FIXTURE_ORIGIN
- explicit LIVE, REPLAY, or MOCK modes

CLI is the intended runtime model transport, not a fallback mislabeled as API access. Invoke the configured executable with structured arguments in an isolated working directory; restrict tools/ambient configuration to the bounded task. Validate its returned structured decision and handle process timeout, nonzero exit, malformed output and account/model unavailability. Preserve a sanitized request/output trace. Do not extract CLI session tokens or pass provider credentials into model context. The actual integrated CLI request must obey the same page-content exclusion boundary as an API request.

Use fresh browser sessions without personal saved profiles. Keep API keys, browser connection endpoints, signed replay URLs, and private fixture truth out of client assets, planner inputs, and public receipts.

Before the initial click, the operator explicitly authorizes the synthetic compromised-credential scenario and the exact synthetic CLI change. Record that authorization. The remainder may run automatically. These permissions do not authorize actual device hardening or automated external incident notifications. Operator-arranged delivery of the single controlled demo message to the designated demonstration mailbox is part of in-event preparation. Confirm the designated sender and recipient before sending; this plan alone is not an instruction to send a message now.

### Vercel execution contract — mandatory for each protected click

1. Hold the original local navigation first. Resolve only a registered fixture ID on the server.
2. Create a **new Vercel Sandbox microVM for every protected click** from an approved clean browser image/snapshot. Start a fresh Chromium process/context. Never reuse a visited browser, worker filesystem or suspect snapshot across clicks. A prepared clean image is permitted; a running VM pool is outside this frozen plan.
3. Install the pinned Chromium/Playwright package and OS dependencies once when preparing the clean image, not per click. Include a valid working directory (the SDK file-transfer path required `/vercel/sandbox` in probes); use explicit command cwd and browser cache path. Rebuild the image during the permitted build window and record its identity. Pre-event disposable probe code/specimens/images do not enter the submission.
4. Apply the permitted egress policy before loading inspected content. Keep destination-origin navigation policy, service-credential policy and provider egress policy distinct. Test redirects and resource dependencies under the actual policy. Do not describe a hostname allowlist as universal origin enforcement or a microVM as quarantine of the physical Mac.
5. Execute one bounded collection and return inert PNG bytes plus structured observations. Record VM creation, browser/collection and returned-evidence timestamps separately. Keep provider tokens on the controller; guest workers receive only their scoped lab credentials.
6. Always supervise cleanup: close browser, explicitly stop the sandbox, observe terminal status, then delete. Record failures; do not equate delete acknowledgement with immediately released capacity. Evidence may be rendered before cleanup finishes, but a tracked cleanup operation and enforced capacity ceiling must remain in effect.
7. Set VM expiry plus shorter navigation/command deadlines. Automatic expiry was observed late relative to the configured ten-second lifetime; use it only as a cleanup backstop. Timeout/outage/capacity rejection yields INSPECTION UNAVAILABLE / BLOCK, never a local browser fallback or fabricated suspicious finding.

Expose only the required harmless lab services. Vercel preview URLs do not themselves establish privacy or workload identity. Enforce authenticated HTTPS endpoints with separate collector-write, capture-read, monitor-write/read and worker-operation privileges; nginx Basic authentication was the tested generic mechanism. Block administrative/prohibited paths and verify denial independently. The runtime controller remains a shared administrative authority; separate VMs alone do not certify verifier tamper resistance.

### Latency, capacity and billing requirements

Use 2 vCPU/4 GiB in iad1 as the initial measured configuration. The 30-run corrected light-page benchmark returned evidence at a sequential median of 2.913 seconds (sample p95 5.336 seconds), despite median VM creation of 0.253 seconds. Rich probes varied from 3.612 to 9.217 seconds with setup uploads and deliberate faults. Do not promise subsecond click-to-verdict or treat startup time as full inspection latency. Keep the holding state immediate and honest; measure the integrated path at M1 and rehearse its actual timing.

Initial experiment ceiling: no more than five simultaneous microVMs across all roles and cleanup, or the account limit if lower. Begin Phase 1 with one click dispatched at a time and reserve capacity for later role separation. Record quota/rejection behavior and preserve failures. During kickoff verify current account concurrency, allocation rate and usage balance; do not rely on the prior Hobby quota as a permanent entitlement. Do not increase scope or purchase upgrades merely to force a passing demo.

Budget by **complete VM lifetime**, concurrent roles and retained snapshots. Vercel’s checked pricing included a one-minute minimum for provisioned memory; at the tested 4 GB/iad1 rate this is about $1.41 per 1,000 short-lived VMs for memory alone before other charges/credits. This is a planning estimate, not an invoice. Recheck current terms at kickoff. Explicitly delete experimental snapshots when finished; a snapshot expiration must be zero or at least one day in the tested API. Keep only the approved event image intentionally retained.

## 5. Email entry point, local interception and remote inspection

The stage demo starts with a real controlled phishing-like message already received in the demonstration mailbox and opened in Apple Mail. The operator clicks its registered harmless HTTPS link normally, without copying/pasting or using a simulated dashboard button. AionGuard does not inspect message contents or act as a mail gateway.

The intended macOS handoff must open the protected Safari profile. Treat this routing as an acceptance test, not an assumed operating-system guarantee. Verify the actual default-browser/profile configuration and extension permissions on the demonstration device. Test Safari initially closed if that is the intended stage state. If routing fails, the real-email entry gate has failed; a manually opened browser fixture does not count as passing it.

Arrange delivery before presenting; live email delivery latency is not part of the hero sequence. During the build window, prepare a self-contained controlled message with one direct registered HTTPS link, no tracking redirects, remote images, attachments or link-preview dependencies. Do not claim the email itself is sandboxed. Account for any observed mail-provider scanning or preview requests separately from local endpoint navigation; destination server logs alone may not identify the request's origin. Record the observation method used to support the no-local-request claim.

Required stage path: received Apple Mail message → normal link click → protected Safari navigation → trusted hold → real Vercel Sandbox inspection → deterministic block → PR-014 investigation. Capture this exact path from a fresh attempt.

Implement one selected Safari profile and a registered harmless destination. The extension intercepts at the request level and redirects to a trusted holding experience. Do not rely only on cancelling a DOM click event. Safari declarative rules are not an asynchronous wait for Vercel Sandbox; the holding page separates the original navigation from the inspection result.

Only the registered fixture ID crosses the application command boundary. The server resolves the allowlisted destination. The employee browser must not load, iframe, prefetch, or embed the inspected content. Display inert PNG media, not returned active HTML.

Prove the original destination receives no local HTTP request before the verdict within the selected scope. Include ordinary click, permitted new-tab/modified-click behavior, redirects, and applicable prefetch/resource behavior in that check. State the demonstrated coverage; do not imply every macOS link is protected.

Owned inert fixture, created during the event:

- Acme Login claim
- Password-field presence
- Declared form destination outside the approved IdP-origin inventory
- No functioning credential collector, real credentials, submission, downloads, or malware

Required observations: final URL, title, relevant bounded text, claimed service, password-field presence, declared/resolved form destination, normalized destination origin, relevant redirect information when observed, PNG reference, timestamps and source provenance.

AUTH-01: credential-entry surface observed.

AUTH-02: claimed Acme authentication has a declared form destination outside the approved exact-origin inventory. Resolve relative URLs; compare normalized exact origins, never substrings. Approved navigation origin and approved identity-provider origin are different policies.

Successful AUTH-01/02: SUSPICIOUS / BLOCK. Inspection failure: INSPECTION UNAVAILABLE / BLOCK without fabricated suspicious findings. Always attempt cleanup and report whether it was confirmed. Missing cleanup confirmation is unresolved cleanup, not automatically an escape.

Receipt wording: no credentials submitted by this inspection; compromise not observed. Declared form destination is not proof of all JavaScript network behavior. Browser replay is optional. Required PNG plus structured observations are sufficient for this POC.

Clean-link release is outside P0. Do not implement a general safe-site certification or automatic arbitrary-site pass-through.

## 6. One case, two evidence phases

Case: PR-014. Principal: Apprentice-07. Every attempt has a unique run ID, revision, and ledger ID.

Phase A: link inspection, sourced from real remote Vercel Sandbox observations.

Phase B: authorized exposure investigation, sourced from the synthetic Acme environment.

Different evidence domains, same case. Vercel Sandbox does not discover Apprentice-07's internal permissions, Jenkins inventory, runtime identity, or Staging grant.

Display LIVE VERCEL / LIVE ASTRA when actually used, and SYNTHETIC ORGANIZATION. MOCK and REPLAY remain explicit. Replayed observations retain original timestamps and source references.

Direct access observations:

| Resource | Status |
|---|---|
| Internal Wiki | REACHABLE |
| Git Metadata | REACHABLE |
| Engineering Share | REACHABLE |
| Jenkins-02 | REACHABLE |
| legacy-prod-secrets | REACHABLE |
| Finance Admin | BLOCKED |
| Production | BLOCKED |

Derive 5 reachable and 2 blocked from observations. Staging is downstream context, never an additional directly assessed resource.

## 7. Hypotheses and initial evidence

HYP-001 — Legacy Production: modeled impact CRITICAL. Reachable legacy artifact references prod-admin-legacy. No actual reusable secret exists.

Required scope assumptions: fresh authentication is necessary; disabled status is enforced; no surviving session or alternate credential applies. These are assumptions, not observations. A valid current disabled-status observation dismisses the modeled path within that scope. Active status alone does not establish authentication feasibility or Production authority.

HYP-002 — Jenkins: modeled impact HIGH, separate from vendor severity. Model the potential relevance of CVE-2024-23897 without exploitation. Keep a visible non-traversable consequence gap between potential service exposure and runtime-identity/downstream authority context.

| Fact | Initially known? | Observation source |
|---|---|---|
| Direct resource access | Yes | Initial access observations |
| Legacy reference | Yes | Initial artifact metadata |
| Jenkins product identity | Yes | Initial asset observation |
| Current legacy principal status | No | Principal check or Activity Ledger |
| Current Jenkins runtime identity | No | Activity Ledger only |
| Exact Jenkins version | No | Version check |
| Effective CLI availability | No | CLI check |
| ci-service permission to Staging | Yes | Initial permission inventory |

Private synthetic truth: principal disabled; last successful authentication 91 days ago; Jenkins version 2.441; CLI enabled and available in the assessed context; runtime identity ci-service; ci-service has the modeled Staging grant. No private truth reaches Astra until an authorized collector returns it as an observation.

The Activity Ledger supplies a current authoritative status projection and current workload identity association, with source/time/validity metadata. A historical disabled event or 91-day-old authentication history alone is not a current disabled-status observation.

Pin a minimal defensive advisory record. Jenkins 2.441 is in the affected weekly range. CLI disabling is a short-term workaround, not a patch. Do not include exploit commands, PoCs, live advisory ingestion, or claims of service takeover/Staging compromise.

## 8. Canonical nine-action catalog

Freeze IDs, targets, costs, possible returned predicates, coverage, freshness/source metadata, and fixed presentation order before dispatching workers. All planners see the same possible coverage; none sees returned values in advance.

| ID | Action | Cost | Permitted evidence coverage |
|---|---|---:|---|
| INV-SECRET-METADATA | Inspect additional secret metadata | 1 | Reference presence and non-secret artifact metadata; no identity state, authentication proof or secret values |
| INV-PRINCIPAL-STATUS | Check referenced principal status | 1 | Current authoritative active/disabled status; no Jenkins facts |
| INV-PRODUCTION-MAP | Map Production resources | 2 | Bounded Production resource/authority metadata; no scan, identity-state or authentication proof |
| INV-CREDENTIAL-AGE | Inspect credential age | 1 | Non-secret age metadata; not credential validity or successful-authentication proof |
| INV-ACTIVITY-LEDGER | Review identity + workload activity | 1 | Current legacy principal status, last successful-authentication context, current Jenkins runtime identity |
| INV-JENKINS-PLUGINS | Enumerate Jenkins plugins | 1 | Bounded plugin inventory only; no paid core version/CLI/runtime facts |
| INV-JENKINS-CLI | Check Jenkins CLI availability | 1 | Effective CLI availability in the assessed principal/network context, with supporting configuration/context provenance |
| INV-ASSET-INVENTORY | Refresh full asset inventory | 2 | Direct resource inventory/reachability and product identity; no principal status, runtime identity, exact version, CLI state or authentication proof |
| INV-JENKINS-VERSION | Confirm exact Jenkins version | 1 | Exact core version with provenance; no CLI/runtime facts |

Each action needs a bounded synthetic handler. No arbitrary URLs, shell, supplied credentials, target discovery or paths. A broad response must not smuggle in other actions' paid facts.

## 9. Budget, broker and hardening

All planners know the whole-case objective: establish supported assessments while preserving the one credit needed for fresh post-change verification.

| Preferred route | Remaining |
|---|---:|
| Start | 4 |
| Activity Ledger | 3 |
| Jenkins version | 2 |
| Effective CLI availability | 1 |
| Fresh post-change CLI verification | 0 |

Version and baseline CLI may occur in either order. The targeted-principal-first route followed by ledger, version, CLI and verification costs 5. With 4 credits, it cannot complete that route. Show the lost verification capacity; do not refill or force the preferred ending.

Astra requests an eligible catalog action or stops, with a short decision summary. It does not set costs, observations, verdicts or depth. The broker validates target, read-only scope, eligibility, payload/revision-bound idempotency, and remaining budget. Reserve atomically before dispatch.

Invalid requests: no spending and no observations. Exact retries: no second execution or charge. Dispatched failed collection: credit remains spent, explicit failure, no invented observation. A repeat/new-revision investigation requires a new justified request and charge.

Hardening changes exactly jenkins.cli_enabled from true to false in the synthetic environment. It is an operator-authorized write, not an Astra read-only action. The write is not evidence of effective availability.

Preserve the baseline. Increment scenario revision. Invalidate old CLI observations for the new revision. Carry unchanged observations forward only via explicit references justified by the one-field change manifest. The fresh INV-JENKINS-CLI goes through the same broker, costs 1, and has origin OPERATOR_VERIFICATION. No additional planner scene is required.

If verification fails or has no budget, HYP-002's changed-state assessment is INCONCLUSIVE. The baseline retained result stays intact. Zero retained is not success when inconclusive hypotheses remain.

## 10. Deterministic evidence semantics

Outcomes are exactly RETAINED, DISMISSED, INCONCLUSIVE. Execution state is separate.

Evidence levels are cumulative:

- E0: reachability supported.
- E1: E0 plus asset identity supported.
- E2: E1 plus advisory applicability supported.
- E3: E2 plus every required modeled prerequisite supported.
- E4: E3 plus relevant runtime/downstream authority context supported.
- E5: consequence independently validated; not implemented or claimed.

Known Staging permission does not establish Jenkins runtime identity. Unknown exact version prevents E2/E3/E4 even if downstream context exists. The ladder is an internal convention, not certification or exploitation probability. Do not force an advisory ladder onto unrelated HYP-001 reasoning; its rule references must explain its own prerequisites.

Assess facts and rules, not fixture names, action order, prose or expected outcomes. A valid uncontradicted falsifier can dismiss a hypothesis. Material unresolved conflict blocks any conclusion dependent on the disputed fact. An independent undisputed falsifier may still dismiss it. Do not choose the latest convenient fact without an explicit authority/validity rule.

Every observation has ID, run/case/revision, subject, predicate, typed value, source/reference, observed time and validity/carry-forward metadata. Every assessment references its rules and supporting/falsifying observations and gaps.

## 11. Planner Adaptation Evaluation — Test C+ (mandatory)

This is an offline evaluation within the build, not extra runtime agents. Compare three planners from independently reset copies of the same starting state. Each has its own observations and ledger. No sharing discoveries or credits between runs.

1. Greedy: select highest-impact unresolved hypothesis; choose the cheapest action addressing a missing required condition. Fixed tie-break: narrower hypothesis coverage first, then canonical catalog order. This intentionally local policy must be disclosed.
2. Coverage-aware: count relevant unresolved prerequisites an action can inform per credit, using visible coverage and source-validity metadata. Do not count irrelevant fields. Fixed tie-break: higher impacted-hypothesis priority, then lower cost, then canonical catalog order. Freeze the precise prerequisite mapping and scoring before measurements.
3. Astra: same facts, coverage, metadata, costs, objective, budget and permitted actions. Real configured model request; no hidden substitution or reroll.

P0 cases:

- Canonical: runtime identity unknown; shared ledger useful.
- Runtime identity already known: part of the shared action becomes redundant.
- Ledger stale/incomplete: visible metadata makes its utility uncertain or limited. Establish the attainable outcome in advance. If it is the only source of runtime identity and cannot supply valid evidence, E4 may be impossible; truthful uncertainty is a valid result.

Measure the complete action sequence, first choice, justified outcomes per credit, relevant observations gained, redundant checks, invalid requests, unsupported factual assertions, remaining verification capacity, and decision latency. Several choices may be defensible. Record all attempted Astra runs and their outcomes, including ties, failures, and worse results. Do not tune variants until Astra wins or claim statistical/general superiority from a tiny evaluation.

Strategy adaptation is an explicit metric: does the selected action or stop decision remain appropriate when known facts, source validity or remaining budget change? Before model runs, define acceptable decision sets and their evidence-based reasons for each existing variant. Score appropriate, inappropriate or indeterminate responses; do not award points merely for changing the action. The same action may remain optimal, and a different rationale alone does not establish better investigation performance. Compare all planners under these same criteria. These small tests establish behavior on these fixtures, not model necessity or general adaptability.

Test C+ remains P0 engineering work, but is supporting presentation evidence. It is not a required Astra victory or a mandatory extended stage segment. A coverage-aware policy can choose the same shared investigation. Show an interesting measured choice briefly; keep ties and failures available in the report.

Use one compact comparison card. Precomputed baseline results must match initial-state hash, scenario/action-contract versions and policy versions. Label their source. They cannot supply evidence to the live Astra case. Show actual selections and results, not an expected winning answer.

## 12. Shared contracts — lead-owned

Before parallel implementation, commit versioned runtime-validated contracts and module ports:

- CaseIdentity: PR-014, unique run/attempt, revision, ledger ID, schema version.
- AuthorizedAssumption and authorization record: scenario/change scope, separate from observations.
- Observation and validity/carry-forward references.
- HypothesisDefinition: impact, prerequisite rules, advisory references and assumptions.
- InvestigationDefinition: canonical ID/cost/target/coverage/source policy.
- PlannerView: observed evidence, gaps, eligible catalog, objective, source metadata and budget; no private truth.
- InvestigationDecision: request/stop, action, relevant hypothesis IDs, short rationale; no verdict/cost authority.
- BrokerReceipt: request ID, origin, acceptance/reason, canonical cost, before/after budget, result references.
- HypothesisAssessment: outcome, impact, applicable depth, rule/evidence references and gaps.
- LinkAssessment: execution/source metadata, PNG, final URL, field/destination facts, AUTH results and block decision.
- CaseEvent: monotonically increasing sequence, run/revision, type/time, validated payload.
- CaseSnapshot: sanitized server projection, modes, immutable baseline and current view, derived counters.
- CaseReceipt: immutable source-referenced summary including authorization, assumptions, budget, outcomes, hardening diff and proof gaps.
- PlannerComparison: scenario/contract/policy/model identity, independent run references and measured metrics.

Ports: evidence collects/evaluates/projects receipt/applies the narrow synthetic change; planner chooses request/stop; broker validates/reserves/executes through injected collector; isolation inspects registered fixture; UI renders snapshots and issues typed commands.

Lead owns create/reset attempt, inspect link, begin preauthorized scenario, investigate/continue, harden-and-verify, fetch snapshot and export receipt commands. Prefer simple snapshot polling. No message bus, database or microservices.

## 13. Five-agent build ownership

These are development agents. Finished product has one Astra planner.

| Owner | Exclusive files/responsibility |
|---|---|
| Lead / integration | src/contracts/**; src/server/runtime/**; src/server/http/**; entry wiring; root manifests/config/lockfile; tests/integration/**; release docs |
| Evidence | src/server/evidence/**; src/server/fixtures/**; tests/evidence/**; docs/handoffs/agent-1.md |
| Planner / broker | src/server/planner/**; src/server/broker/**; tests/planner/**; tests/broker/**; docs/handoffs/agent-2.md |
| Interception / Vercel | src/extension/** including extension-specific packaging/config; src/server/isolation/**; fixtures/web/**; tests/interception/**; tests/isolation/**; docs/handoffs/agent-3.md |
| Experience | src/ui/** including holding-page presentation; tests/ui/**; docs/handoffs/agent-4.md |

Lead owns holding-page HTTP routes and inspection commands. Experience owns their visual rendering. Interception owns the extension and its command handoff, not independent application routes. Lead centrally coordinates shared packaging/dependencies and the designated demo mailbox/runbook. Interception owns verification of the Apple Mail-to-protected-Safari handoff. No mailbox API or mail-delivery service is added to the application.

Create pr/integration, pr/evidence, pr/investigation, pr/isolation, pr/experience from one contract baseline, each in a distinct worktree. Do not run concurrent workers against one mutable checkout. If subagent tooling cannot honor distinct worktrees, use isolated worktree tasks during the authorized build period.

Only lead changes shared contracts/dependencies/root configuration. Workers request missing fields rather than inventing schemas. Lead distributes contract changes. No editing peers' files without explicit ownership transfer; do not revert others' changes.

Each worker returns an early compilable interface commit and completion commit. Handoff includes worktree/branch, SHA, exports, changes, actual checks, dependencies, limitations and integration notes.

Suggested reasoning: lead/evidence/planner xhigh; interception high or xhigh for boundary questions; experience high. No extra implementation owner or QA-only agent required.

## 14. Build milestones and acceptance checks

M0 — In-event foundation: verify organizer window; new repository; contracts, ports, registry, source labels and minimal stubs; dependencies; common commit; dispatch four workers.

M1 — First real gate: received controlled message in Apple Mail → normal email-link click → verified protected Safari profile → trusted hold → real Vercel Sandbox inspection → returned evidence. Prove the registered destination receives no local HTTP request before the verdict within the demonstrated scope; distinguish remote inspection and any mail-provider requests from endpoint requests. Separately prove a genuine Astra round trip through the intended Codex CLI executable/account. If dedicated event API access is supplied and selected, verify that alternative transport before using it. Resolve Mail-to-Safari routing, extension permission/package/origin issues now. Do not polish the graph first.

M1 scope gate: no architectural expansion until the actual AionGuard repository demonstrates the Mail-origin protected navigation → automatic hold/inspection → live Vercel Sandbox → authorized real Astra request → brokered observation → evaluator → case snapshot path. Separate provider probes alone do not close this gate. Repeat from at least two fresh attempts and retain every failure and manual intervention. Record elapsed time from M0, time to first successful M1, time to repeat, provider transport/account, and integration defects. Roughly 90 minutes with repeatability is a capacity-review checkpoint, not automatic stretch authorization. If M1 takes 3–4 hours, preserve scope and prioritize completion. Neither threshold is a predicted duration. Completing M1 does not remove M2/M3 requirements. Tripwire is the first planned expansion; continuity follows only after its completed release. M1 alone authorizes neither: the full release and time gates in sections 17–18 must pass. All other stretch features remain unapproved.

PulseRange comparison: see [benchmark review](../planning-provenance.md#omitted-source-material). Its live integration evidence reduces uncertainty but cannot replace this gate or authorize copying its implementation. In particular, prove inspection dispatch for a navigation originating outside the local application; a redirect-only holding fallback is insufficient. Verify the intended event model transport/account independently.

Then integrate one planner request → broker → collector → observation → evaluator → snapshot → UI. Integrate early compatible commits, not four independently designed apps at the end.

M2 — Full case: all bounded actions, ledger source, evidence rules, baseline, hardening revision, fresh verification, receipt, both baselines and small Test C+ report. Implement preferred and honest alternate outcomes.

M3 — Freeze: targeted owner checks plus full type/build/integration milestone and visual rehearsal. After changes, repeat relevant checks; broaden for cross-cutting contract/evidence/budget changes. Prepare source, setup instructions, secret-free env template, runbook, actual receipt and measured narration.

### Three mandatory sequencing and evidence checks

These are in-event acceptance checks for the existing architecture, not authorization for pre-event product implementation.

1. **Block before model dispatch.** Record ordered events for held local navigation, remote inspection, deterministic SUSPICIOUS / BLOCK (or INSPECTION UNAVAILABLE / BLOCK), and any subsequent Astra dispatch. The first Astra request must occur only after the block decision and recorded scenario authorization. An unavailable inspection must not fabricate findings or silently launch the normal successful handoff. Test with the model provider unavailable: the link must still receive its deterministic block result without depending on model access. Capture click-to-block time separately from browser launch and later investigation latency; launch measurements are not end-to-end latency evidence.
2. **Page content stays out of the model request.** Use an explicit allowlisted projection for PlannerView and inspect the actual serialized outgoing provider request in a controlled test, including all input messages and tool context. Page-derived titles, URLs, form-action strings, text, HTML, screenshots and encoded copies stay in the inspection evidence store and sanitized UI projection; they do not enter Astra's request. If the planner needs the link outcome, pass only fixed policy enums and opaque internally generated references. Its investigation facts come from the separately authorized internal evidence domain. During the event, place unique harmless marker strings in the owned page's title, text and destination fields; assert their absence from the complete outgoing request, alongside structural field/type checks. A schema with string fields is not by itself protection. Preserve a sanitized request projection and test result for Q&A without credentials or provider connection secrets. This proves the tested input boundary, not universal prompt-injection immunity.
3. **A write cannot manufacture verification.** Record the authorized configuration-change event and new scenario revision before the fresh brokered CLI observation. Between those events, preserve the labeled baseline HIGH / RETAINED result and keep the current assessment INCONCLUSIVE with verification pending. Assert that no success counter, dismissal or verified-after-state event appears from the write alone. Only a valid fresh observation may support dismissal; a failed or unaffordable verification must leave an explicit gap. Save a receipt/event trace showing the successful transition and the failure case.

The release evidence must make all three checks inspectable. No model invocation belongs on the link-classification path. Do not claim these checks passed until the actual integrated application executes them.

Required negative checks:

- Principal active alone cannot prove Production path; conflicting status cannot conveniently dismiss it.
- Stale/incomplete ledger cannot supply current identity facts.
- Unknown version caps Jenkins depth; downstream context never skips levels.
- Configuration change alone cannot change the verdict; stale CLI evidence is rejected for the new revision.
- Repeated/concurrent requests cannot overspend or duplicate charges/execution.
- Invalid requests/refusals/failed collectors cannot invent observations or success.
- Missing post-change credit produces verification gap, not a reset.
- Original destination stays off the local browser within demonstrated interception scope, including failure.
- The exact stage path starts from a received controlled Apple Mail message and reaches the protected Safari holding page through a normal link click, without pasting or pre-opening the fixture URL. Test the intended Safari startup state and record profile/extension configuration.
- Client/planner/public artifacts contain no private fixture truth, secrets or browser capabilities.
- Direct counters remain 5/2; Staging never increments them.
- Baseline remains immutable; zero retained with inconclusive hypotheses is not success.

## 15. UI, receipt and demonstration

See [demo presentation notes](presentation.md) for the step-by-step Astra scene and judge answers. These are planning notes, not UI assets or application implementation.

One case workspace: header/source badges; holding/inspection panel; two-path fixed-layout graph; investigation/budget timeline; compact comparison card; evidence and receipt. UI renders server facts, never calculates verdicts or advances to success on timers.

Impact, outcome and evidence depth are separate. Show CRITICAL / DISMISSED and HIGH / RETAINED / E4 clearly. Preserve the Jenkins consequence gap visibly. Show uncertainty and provider failures as normal states.

Receipt is P0: PR-014/run/revisions; Apprentice-07; actual link findings; no observed compromise; preauthorization and assumed compromise; 5/2 access counts; actual planner/action references and spending; rule/evidence-backed outcomes; maximum supported depth; zero exploit attempts; consequence not demonstrated; immutable baseline; fresh hardening result and verification gaps.

Stage the story around three reversals:

1. The click does not have to load the destination locally. Show the held navigation and remote observations. Claim only the interception coverage actually demonstrated on this endpoint.
2. The CRITICAL-looking path is dismissed by evidence. Make CRITICAL / DISMISSED the clearest visual reversal. Astra selected the investigation; AionGuard evaluated its observations.
3. Applying a change does not establish its effect. Fresh verification must produce the after-state.

For the third reversal, show the following server-owned states distinctly:

| Moment | Preserved baseline | Current revision |
|---|---|---|
| Before hardening | HIGH / RETAINED / E4 | Same supported baseline |
| Change applied, verification pending | HIGH / RETAINED / E4, labeled BASELINE | INCONCLUSIVE; verification REQUIRED or RUNNING; old CLI evidence invalid |
| Fresh CLI-unavailable observation returned | Baseline unchanged | HIGH / DISMISSED; verified modeled condition |
| Verification fails or budget exhausted | Baseline unchanged | INCONCLUSIVE; explicit verification gap |

Do not leave HIGH / RETAINED unlabeled as the new revision's result while verification is pending. Do not show green success on the configuration write. The result concerns this modeled CLI-dependent exposure; it is not proof that Jenkins is patched or that every exposure is removed.

Preferred 90-second presentation, subject to actual measured latency:

| Time | Beat and narration |
|---|---|
| 0–20 s | Open the controlled message in Apple Mail → normal link click → verified Safari handoff → hold → remote inspection. “The employee clicks the email normally. AionGuard holds local navigation and opens the destination remotely.” |
| 20–30 s | Indicators → block → same case. “We observed a credential surface and an unapproved declared authentication destination. Now we investigate the authorized scenario: what if this account's credentials were compromised?” |
| 30–50 s | Actual Astra choice → observations → critical dismissal. “Astra chose this investigation. The returned identity evidence rules out the critical path under our declared assumptions.” If ledger selected, show its second observation advancing Jenkins. |
| 50–65 s | Supported Jenkins result. “This potential exposure remains supported. Its consequence has not been demonstrated.” |
| 65–85 s | Change → visibly pending verification → fresh observation. “Changing the setting isn't our success condition. This new observation supports dismissal of the modeled exposure.” |
| 85–90 s | Receipt. “Astra chooses what to inspect. AionGuard shows what the evidence supports.” |

The comparison gets a brief beat only when it helps explain the actual choice. Do not promise a fixed first selection. For a tie: “Astra matched our coverage-aware policy on this case.” For worse performance: “This run spent an extra credit; the evaluator still preserved the verification gap.” Report exact measured results, not these example outcomes by default.

Rehearse actual latency. Prepare alternative narration for a different action, failed collection, tie, or unavailable verification. Never reroll for the intended story. Precomputed comparison/replay must be labeled and tied to its original run. If the run cannot fit 90 seconds, disclose any recorded portion rather than disguising it as live or forcing timers.

Submission thesis: AionGuard gives an AI investigator bounded choices while keeping conclusions tied to observations. A defensive change receives a verified after-state only when fresh evidence supports it.

Optional roadmap sentence, after the demonstrated result: “Next, we want verified investigations to become reusable defensive checks.” This capability is proposed, unbuilt and untested; it is not a property of the receipt already demonstrated.

## 16. Hard scope boundary

No fleet management, second endpoint/browser, real IAM connector, general safe-link release, malware or escape testing, broad vulnerability ingestion/scanning, downloads/hash capture, extra personas/hypotheses, SIEM, Slack/Jira integration, automated incident email, mailbox API, mail-gateway filtering, message classification, computer-use console, extra runtime planner or graph editor. The single controlled Apple Mail message and its normal link click are explicitly P0 as the entry point. Email security beyond that verified handoff remains out of scope.

No compounding-defense implementation, learned check format, recurrence benchmark, new SQL permissions graph, or second IAM/server scenario. Other alert types and reusable defenses are roadmap ideas only.

Completion ahead of schedule authorizes reliability and presentation improvement, then only Phase 2 Tripwire (section 17), followed by Phase 3 continuity (section 18) if its gate passes. Tripwire permits synthetic owned-lab submission and independent monitored replay. Continuity permits one disposable source worker, a protected job-service boundary and one fresh recovery sandbox; it does not authorize another exposure scenario, arbitrary remediation, or production deployment. More sophisticated containment, real identity integrations, and general release policy are future work.

Astra can explain the captured evidence and select follow-up checks. It does not independently certify containment. Report the actual protection steps: original navigation held within scope; remote inspection succeeded/failed; evidence captured/missing; destination blocked; cleanup confirmed/unresolved.

## 17. Phase 2 — Tripwire (first expansion)

### Frozen purpose and scope

After the completed Phase 1 release, add one owned-lab marked-credential experiment to PR-014. A fresh remote browser submits a unique synthetic decoy to an owned collection fixture. A separate, explicitly labeled replay actor reads what that fixture actually captured and attempts use at an owned monitored endpoint. AionGuard correlates the independently observed attempted use with the original case.

This is an explicit scope amendment: Phase 1's no-submission inspection stays unchanged. Only this separately authorized Phase 2 interaction may submit synthetic demonstration values to the registered owned collection endpoint. Do not silently turn the Phase 1 inert fixture into a working collector. Use a distinct registered interaction fixture/session and retain phase-specific provenance in the same case.

Hard limits: one issuer, one owned collection fixture, one replay actor, one monitored endpoint, one receipt addendum. No employee credentials, real identity provider, live attacker infrastructure, external threat reports, session-cookie capture, clipboard replacement, OAuth/device-code flow, ClickFix detection or takedown integration. A decoy grants no organizational access. No real compromise is introduced. This is controlled deception telemetry, not poisoned-session neutralization or a claim of a new industry category.

### End-to-end evidence chain

1. Record operator authorization for the exact fixture, monitored destination, synthetic submission and bounded observation window. Keep the employee's protected destination blocked regardless of this experiment's outcome.
2. Issue a unique, expiring decoy identifier and synthetic secret for this attempt. Restrict their acceptance to the owned demonstration endpoint. Keep raw values out of logs, model inputs and public receipts; use an opaque correlation reference or keyed digest.
3. In a fresh Chromium instance in a Vercel Sandbox microVM, submit only those synthetic values to the owned collector. Record the browser request result separately from the collector's receipt of the expected data. A successful click or HTTP response alone does not establish capture.
4. Keep the replay actor stopped initially. Capture may be observed while replay is NOT OBSERVED during the stated healthy observation window.
5. Start the separately controlled replay actor. It obtains the actual captured record through its scoped read channel, not from the decoy issuer, shared expected-answer state, model output or receipt store. If submission failed, it has nothing to replay.
6. The actor attempts use at the owned monitored endpoint. That endpoint records the request independently and grants no organizational access. Record case correlation, identifier match, paired synthetic-secret match and validity at attempt separately. A wrong or missing secret does not establish reuse of the captured pair. Correlate matched expired/revoked pairs historically while labeling their current validity; do not grant organizational authority. Record actor/source context. This is a simulated replay actor performing a real lab request, not an identified criminal.
7. Export an addendum with separate issued, submitted, captured and attempted-reuse observations. Close the browser, stop the actor, expire/revoke decoys and report cleanup. A telemetry outage yields INCONCLUSIVE, not “no replay.”

AionGuard must not call its own monitored endpoint and present that call as independent reuse. Collector forwarding alone establishes forwarding, not subsequent use. The observation window and source health accompany every “not observed” result. A completed absence conclusion also requires a monitor-owned checkpoint or authoritative query proving ingestion through the closed interval. Health alone is insufficient. While delivery is incomplete, retain a provisional/inconclusive state. Record event time and ingestion time separately; late arrivals create an append-only correction rather than rewriting the original receipt. Unknown or altered identifiers must not produce false case correlation. Known identifiers with wrong or missing secrets are identifier-use attempts, not confirmed captured-pair reuse. Matching expired/revoked pairs retain historical case correlation but cannot be labeled currently valid. Repeated delivery of the same telemetry event is deduplicated, while distinct repeated attempts remain distinct.

### Authority, model role and contracts

Keep issuer, collector, replay actor and monitor privileges distinct. The actor cannot read issuer storage or write verifier results; the collector cannot emit authoritative replay conclusions; the monitor cannot grant real service authority. A shared repository is acceptable; shared expected-answer objects bypassing the data path are not.

Astra may select a permitted next observation or explain fixed verified event summaries. Its invocation is not required to establish whether capture or replay occurred. Raw page text, form fields, decoys and replay payloads remain outside Astra's request. Use fixed event enums, opaque references and bounded source/health metadata. Do not add a model call solely to restate a known callback event or claim it discovered an already recorded fact.

Lead-owned in-event contracts: TripwireAuthorization (targets, synthetic interaction scope, window/limits); DecoyReference (opaque ID, case/attempt, issuance/expiry, no public raw values); CaptureObservation (collector record/request reference and observed time); ReplayObservation (independent monitor event, source actor, received time and correlation result); TripwireAssessment (capture state, replay state, observation-window health and gaps); TripwireReceiptAddendum (source references, authorization and cleanup).

Tripwire does not spend or refill Phase 1's four evidence credits. Set explicit session/request/runtime/provider-cost ceilings before dispatch, including limits for negative controls. All submissions and replay requests are authorized side effects. Provider or collector failure keeps protection intact, records the gap and cannot fabricate suspicious findings or reuse.

### Required acceptance checks

| Experiment | Required result |
|---|---|
| Issue but do not submit | No capture or replay claim |
| Submit; replay actor stopped | Capture observed; replay not observed in a healthy declared window |
| Actor reads captured record and attempts use | Independently observed, correctly correlated attempted reuse |
| Submission/capture fails | Actor cannot bypass capture by obtaining issuer data; no invented reuse |
| Unknown or altered identifier | No false case correlation; reason retained |
| Known identifier with wrong/missing secret | Identifier attempt only; no captured-pair reuse claim |
| Matching expired/revoked pair | Historical correlation retained; current validity false |
| Delayed event delivery | No completed absence conclusion before closed-window ingestion is established |
| Monitor unavailable | INCONCLUSIVE monitoring, not successful absence verification |
| Duplicate telemetry delivery | One event recorded once; no inflated replay count |
| Fresh complete repeat | New decoy/run, actual capture and independent replay, confirmed cleanup |

These are future acceptance criteria, not passed POC results. The earlier browser inspection and stateless reconstruction probes do not prove Tripwire submission, capture or replay correlation.

Reserve at least 30 minutes within the existing Phase 2 experiment window for the full negative-control pass; this is an allocation, not a completion guarantee. Preserve the final-hour release reserve separately. Record PASS/FAIL/NOT RUN with actual evidence for every required check. If a required check fails or remains unrun, do not promote Tripwire or start Phase 3. A happy-path success cannot waive this gate. See the [rehearsal checklist](poc-readiness.md).

### Optional depth upgrade — observed submission routing

After base Tripwire and its negative controls pass, compare the declared form destination with the actual destination of the synthetic submission. This optional upgrade shares Phase 2's existing time and spending allowance; omit it if it threatens release or rehearsal. No additional phase or detector category is authorized.

Use the existing registered interaction fixture and owned collector. In the controlled fixture, a form declares destination A while its JavaScript sends the synthetic values to preauthorized owned collector B. Both destinations must be explicitly approved for the experiment; Phase 1's inert fixture and AUTH rules remain unchanged.

Record the pre-interaction declared destination, actual browser request destination, independent collector receipt of the matching decoy pair, and their case/attempt references. Compare normalized origins deterministically. A request without receipt establishes attempted submission only; absent telemetry is inconclusive. Raw page/network contents and decoy values remain outside Astra's request. Use a controlled fixture without service workers unless their network visibility is explicitly verified. Do not claim universal egress visibility or malicious intent from a mismatch alone.

Acceptance: observed A differs from observed B; browser telemetry and collector receipt agree on B; actor-stopped still yields no observed reuse only within a complete healthy interval; missing request/capture evidence cannot manufacture destination confirmation. Preserve all base Tripwire negative controls. See [final review](../planning-provenance.md#omitted-source-material) for rationale and vendor capability references; this specific behavior has not yet been tested.

Stage line: “The page declared one destination. During our controlled interaction it sent the marked values somewhere else. We verified receipt and later correlated their attempted reuse.”

### Release and timing gate

At approximately hour three, begin Tripwire only if Phase 1 is submission-ready: M1 in the actual AionGuard repository, intended CLI transport/account (or an explicitly selected dedicated event API), full evidence/change/verification loop, clean repeat, required checks, receipt and rehearsable presentation. Standalone CLI provider tests and Vercel Sandbox probes do not close the integrated M1 path; CLI itself is the planned supported transport. If the checkpoint fails, finish Phase 1; do not begin either expansion.

Freeze/tag a runnable Phase 1 release and preserve its configuration, data, provider capacity and recording. Use separate experiment branch/worktree, ports, credentials/state and bounded spending. Confirm the baseline starts without undoing Tripwire infrastructure changes. Promote Tripwire only after its negative controls and fresh repeat pass and the combined demonstration remains usable.

The expansion time is shared, not multiplied: in an eight-hour window, target three hours for Phase 1, allow at most the next four hours for all expansion work combined, and reserve the final hour before the actual submission cutoff. Phase 3 gets only remaining capacity after a completed Phase 2 release. It does not receive another four-hour allowance. If Tripwire stalls, do not pivot around it into continuity during the event.

### Development ownership and presentation

After Phase 1 handoffs freeze, lead owns shared contracts/runtime, registration, release gates and addendum assembly. Evidence owns src/server/tripwire-evidence/** and tests/tripwire-evidence/** for correlation, observation validity and independent negative checks. Planner/broker owner owns src/server/tripwire-control/** and tests/tripwire-control/** for issuer, authorization, limits and optional bounded model projection. Interception/Vercel owner owns lab/tripwire/**, src/server/tripwire-execution/** and tests/tripwire-lab/** for owned endpoints, scoped replay actor and browser submission. Experience owns the case's Tripwire panel in src/ui/**. Workers request lead-owned contract changes; runtime component permissions remain separate. No implementation paths are created before the event.

Display the actual chain: DECOY ISSUED → CAPTURE OBSERVED → REPLAY NOT OBSERVED (window) → REPLAY ATTEMPT OBSERVED, only as returned evidence permits. Actor/source labels stay visible. Do not turn a timeout into “attacker stopped” or infer employee compromise from a synthetic replay.

Stage line: “The employee stayed blocked. In our owned lab, the page captured a marked decoy. A separate replay actor used that captured record, and AionGuard linked the monitored attempt to this case.”

Reporting is receipt/draft-only. No live submission switch for reporting the harmless fixture to blocklists or abuse desks. A signed receipt preserves integrity, not proof of attacker identity. If Tripwire cannot pass, use Phase 1 and label the experiment incomplete.

## 18. Phase 3 — Verified Incident Continuity (later gold attempt)

### Objective and bounded demonstration

Given an operator-authorized restriction on a suspect workload environment, Astra reconstructs one approved essential workload in a fresh Vercel Sandbox microVM from trusted sources. AionGuard accepts recovery only when the original worker remains restricted, the replacement performs fresh authorized work, and authority and state integrity checks pass.

This is the third delivery phase, after a completed Tripwire release. It no longer replaces Tripwire. Repair Lab remains out of scope. Preserve both earlier runnable releases. Phase 3 demonstrates continuity during containment, not arbitrary application migration or uninterrupted uptime.

One case, one registered Release Coordinator workload, one disposable source environment, one fresh recovery sandbox, and one approved harmless job/output. The coordinator is the client of the existing Jenkins service role; do not migrate the Jenkins server, add another exposure hypothesis, or create another enterprise scenario. The source environment is an owned lab worker, not the user's entire physical Mac. The Mac remains the presentation/control endpoint. A lab worker may stay powered on while its protected service access is restricted.

Policy PR-CONTINUITY-01: restrict the source worker's protected job access and recover its designated release-coordination operation from approved sources under equivalent or narrower authority. This is a separately authorized exercise within PR-014, not proof that the phishing click compromised the host. Synthetic Phase 1 identity facts remain labeled and cannot establish live host compromise or live recovery success.

Astra does not certify that a computer is locked or isolated. Screen lock, network restrictions, credential revocation and process state are separate facts. Vercel Sandbox provides the replacement execution environment; a separately controlled policy enforces the source restriction. A browser sandbox does not wrap or quarantine an arbitrary physical computer.

### Provider evidence and capability gate

Documentation and live Vercel qualification support the selected Linux microVM runtime, commands/background processes, file transfer, snapshots, HTTPS exposure and egress controls. See [Vercel qualification](evidence/07-vercel-qualification/README.md). Two fresh replacements actually ran the same hashed stateless polling program with new credentials and fresh outputs over more than 60 seconds; old credentials remained denied in sampled checks. These are execution and stock-service authority primitives, not the protected job-service, no-outstanding-work, duplicate-work or state-reconciliation gates below. Vercel documents isolated Linux microVMs; behavioral probes do not independently certify their hardware isolation. Historical Astra-directed reconstruction ran on Solari and remains historical.

During the event, after the Phase 2 release and Phase 3 time gate, prove sandbox creation, approved pinned-source retrieval, permitted service connectivity, background-process behavior, independent result retrieval and teardown. Verify account quota, lifecycle/idle timeout and resource limits. Choose a portable non-GUI workload; Linux support is not native Mac/Windows application compatibility. Do not publicly expose a vulnerable service or use an unrestricted tunnel to obtain connectivity. If approved connectivity or required enforcement cannot be provided, stop Phase 3 and retain the latest verified earlier release.

### Release gate and experiment isolation

Start Phase 3 only after Phase 2 Tripwire is complete, its negative controls and fresh repeat pass, and the combined submission is independently runnable and rehearsable. Record remaining time and an experiment ceiling before starting. Preserve the final-hour reserve. A completed primitive probe, M1 alone or unfinished Tripwire does not qualify. If insufficient time remains, defer continuity; do not weaken its checks to fit.

Freeze the baseline commit/tag, startup configuration, service/fixture state, receipt and labeled recording. Use distinct experiment worktrees, ports, credentials, services/state and spending limits. Reserve baseline provider capacity. Prove the baseline remains launchable without reversing continuity experiments. A branch is not runtime isolation.

For an eight-hour window, Phases 2 and 3 share at most the four expansion hours after the target three-hour Phase 1 checkpoint. Phase 3 receives only what remains after Tripwire, with the final hour reserved for release selection and rehearsal. There is no promise that all three phases fit. Promote only a repeatable combined result. No last-minute promotion merely because a sandbox started.

### Astra's actual task

The operator names the critical workload and approves its required behavior, authority ceiling and sources. Astra examines its trusted workflow definition and dependency information, identifies the minimum required runtime, and produces a reconstruction manifest: pinned source revision, approved base image and dependencies, entry point, required non-secret configuration, secret references, permitted destinations, authoritative state source and readiness checks.

This is discovery within one registered workload, not autonomous enumeration of all critical processes on a computer. Criticality is an operator decision. Astra may adapt approved launch/configuration files within a declared surface, but cannot edit application business behavior, acceptance requirements, job definitions, authority policies, source checkpoints or the verifier. No arbitrary host snapshot, process-memory migration, filesystem clone or copied environment dump.

The broker validates the manifest and approved resources before execution. A constrained executor builds the replacement using pinned trusted sources. The model does not receive credential values or arbitrary administration capabilities. A generated manifest is untrusted until policy validation; filesystem and execution isolation must enforce the boundary, not merely a prompt.

### Trusted reconstruction and state ownership

- Use an operator-approved repository revision, reviewed base image and locked dependencies. A repository URL alone is not evidence that a revision is trusted.
- Supply replacement credentials through a separate trusted channel. Do not copy source-worker secrets, sessions, caches, binaries, plugins, volumes or startup scripts.
- Use externally maintained authoritative work records/checkpoints. Suspect-host observations may describe what was running but cannot supply trusted executable state or completion truth. Treat their content as untrusted evidence, not model instructions.
- Keep inspected-page content out of all continuity model requests, as in Phase 1. Secret references are opaque and resolved only by the executor.
- Compare effective replacement permissions to the approved workload policy. A new credential may differ in value while providing no broader authority. Explicitly test a prohibited operation with the replacement identity.

If required state exists only on the suspect host and cannot be independently validated, stop with RECOVERY INCONCLUSIVE. Do not invent a clean checkpoint or silently discard pending work.

### Prevent duplicate ownership before recovery

A restricted host may still have an active connection, queued job, cached credential or surviving process. Stopping its visible process or issuing a firewall command is insufficient proof that it cannot act.

Use an operator-controlled authority boundary at the protected job service, outside both workers. Revoke the original worker identity and issue a distinct scoped replacement identity. The service must reject old credentials, including a deliberate retry by the still-running old worker, before replacement dispatch. Neither worker can change policy or issue credentials. For this between-jobs demo, mandatory identity revocation is sufficient; do not add a lease/generation subsystem unless the selected service already needs one. The verifier independently observes enforcement and cannot substitute a change acknowledgement for denial. If only service-access fencing is implemented, label the source “PROTECTED JOB ACCESS RESTRICTED”; do not label the whole endpoint network-isolated.

Perform cutover between jobs. After revoking old submission access, the authoritative service must confirm no accepted or running job remains outstanding before replacement dispatch. If any work remains or its status is unknown, keep recovery waiting/inconclusive; do not cancel, migrate or resubmit it to force progress. Existing work IDs support fresh-result correlation and duplicate detection. A source-worker claim of idleness is insufficient. This avoids building in-flight cancellation, partial-job migration or general failover machinery. Do not promise seamless migration or exactly-once execution.

### Execution and independent acceptance

1. Establish the source worker's successful operation and authoritative work records before restriction.
2. Record operator authorization and enforce the declared source restriction/fencing. Independently observe denied protected access and retained service health. A dead service or timeout is not containment evidence.
3. Confirm the between-jobs cutover gate from authoritative service records after revocation. Record the availability interruption and last completed work ID; do not imply zero downtime.
4. Astra proposes the minimal reconstruction manifest. Broker validates it; executor launches a fresh Vercel Sandbox microVM from approved sources and separately supplied state/credentials.
5. Before granting active ownership, verify build/source identity and readiness. Grant only the distinct approved replacement identity.
6. Submit a fresh harmless challenge job. Independently retrieve its actual service job/build ID and artifact, correlate the challenge and check no duplicate accepted work.
7. Recheck original-worker denial during and after recovery and the replacement's prohibited-operation denial. Observe at least three consecutive authorized work cycles over a declared window of at least 60 seconds; record exact interval and results. This tests bounded sustained operation, not always-on availability.
8. Repeat from a clean lab baseline using the exact manifest/source hashes, a fresh sandbox, new scoped credentials and new challenges. Accept only supported results; cleanup remains explicit.

Acceptance requires all five conditions:

| Condition | Required result |
|---|---|
| C — Containment scope | Original worker denied the declared protected operation, including old-credential retry, while the destination service is healthy |
| T — Trusted reconstruction | Approved source/image/dependency/state provenance; no unapproved suspect-host state copied |
| O — Operation and integrity | Fresh expected output independently observed, no outstanding work at the cutover gate, no duplicate accepted work in tested cutover, bounded sustained operation passes |
| A — Authority | Replacement has no broader effective permissions and prohibited operation remains denied |
| R — Repeatability | Exact reconstruction succeeds again from a clean baseline while source restriction remains effective |

ACCEPTED RECOVERY requires C AND T AND O AND A AND R. Per-check PASS/FAIL/INCONCLUSIVE stays separate from Phase 1 hypothesis outcomes. Any missing check blocks acceptance. Configuration acknowledgments, Astra prose, heartbeat alone or printed success cannot establish recovery. If recovery fails, keep the source restricted; never automatically unquarantine it to make the demo green. Failback is out of scope and requires a separate future authorization.

### Verifier negative controls

Run before acceptance and retain results:

| Negative control | Required behavior |
|---|---|
| Destination service offline | Distinguish outage from source restriction; no recovery success |
| Source restriction removed / old credential retried | Detect failed containment or deny stale ownership; never accept two active owners |
| Unapproved source/checkpoint offered | Reject reconstruction input; no silent trust upgrade |
| Old artifact or duplicate work ID | Reject freshness claim or deduplicate without duplicate effects; retain observed outcome |
| Replacement requests broader authority | Reject policy or acceptance despite a working job |
| Sandbox/process stops or observation channel fails | Report interrupted/inconclusive continuity; keep source restricted |

A control passes only if its intended condition reaches the corresponding verification check. Show actual counts with evidence links, not a hardcoded badge. Reset verifier-owned mutations before normal runs.

### Budgets, records and ownership

Retain four Phase 1 evidence credits unchanged. Continuity has at most three reconstruction candidates and separately recorded model/provider cost, maximum concurrent sandboxes, job-run and wall-clock limits chosen before dispatch. Operational runs are explicitly authorized side effects, not free read-only evidence. Preserve every model attempt and candidate; retries must be logged and idempotent, not hidden rerolls. Failed candidates cannot spend reserved baseline/demo capacity. Stop and kill/revoke experimental resources at the limit; record unresolved cleanup honestly.

Lead owns future contracts: ContinuityTask (case/policy/authorization, workload, scope, source/state allowlist, limits), ReconstructionManifest (candidate/model/run IDs, pinned inputs, secret references, permitted runtime), CutoverRecord (old/new ownership, revocation/fencing observations, reconciled work IDs), ContinuityVerification (C/T/O/A/R, negative controls and references), and AcceptedRecoveryPackage (exact manifest, clean repeat, measured interruption and limitations).

Receipt addendum includes source and replacement environment IDs, sandbox ID, source/image/lockfile/state hashes, old/new identity references (and generation if the service uses one), actual job/build IDs, artifact hashes, source-denial and permission observations, timestamps, recovery duration, authoritative no-outstanding-work check and completed work references, observation window and cleanup. Preserve Phase 1 baseline; never relabel its synthetic facts as live. Redact credentials and signed browser/preview capabilities. Snapshot only an independently approved clean template if used; never snapshot the suspect worker for recovery.

After freezing Phase 1 handoffs, reuse the four workers with exclusive in-event paths: lead owns contracts/runtime/release; evidence owns src/server/continuity-verification/** and tests/continuity-verification/**; planner/broker owns src/server/continuity/** and tests/continuity/**; interception/Vercel owner owns lab/continuity/**, src/server/continuity-execution/** and tests/continuity-lab/** for lab enforcement and sandbox lifecycle; experience owns continuity display in src/ui/**. Lead distributes contracts before work. Runtime Astra cannot edit verifier or enforcement components even though development agents implement them in the same submission repository. These path assignments do not authorize creating implementation now.

### Stage story and honest scope

Show: original coordinator working → declared access restriction verified → work interrupted → Astra's trusted reconstruction plan → fresh Vercel Sandbox microVM → new work/output independently verified → original worker still denied.

Final panel:

- Original worker: protected job access RESTRICTED (or broader quarantine only if actually enforced/tested).
- Essential workload: RECOVERED during the measured window.
- Recovery environment: actual Vercel Sandbox microVM ID.
- Trusted inputs: VERIFIED; workload authority: NOT EXPANDED.
- Pending work: reconciled; fresh output: VERIFIED; clean repeat: PASSED.
- Interruption: actual measured duration; unassessed operations: explicit.

Stage line: “We kept the original worker restricted and reconstructed its essential operation from trusted sources. Astra planned the recovery; AionGuard verified that work resumed without restoring the original worker's access.”

Avoid “always on,” “no downtime,” “computer fully isolated,” or “all critical systems moved” from this bounded result. No arbitrary physical-host quarantine, malicious escape testing, general disaster recovery, production service move or additional trigger is included. Recordings must retain original run identity and be labeled. If gold fails, submit Phase 1 and disclose continuity as an incomplete experiment.

## 19. Primary references


Verify current provider/account and organizer requirements during kickoff.

- Vercel Sandbox: https://vercel.com/docs/sandbox
- Vercel authentication: https://vercel.com/docs/sandbox/concepts/authentication
- Vercel snapshots: https://vercel.com/docs/sandbox/concepts/snapshots
- Vercel firewall: https://vercel.com/docs/sandbox/concepts/firewall
- Vercel pricing/quotas: https://vercel.com/docs/sandbox/pricing
- Playwright network observations: https://playwright.dev/docs/network
- Event: https://cerebralvalley.ai/e/openai-gpt-6-astra-nyc
- Models: https://developers.openai.com/api/docs/models
- Structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- Safari request blocking: https://developer.apple.com/documentation/safariservices/blocking-content-with-your-safari-web-extension
- Safari extensions/permissions: https://developer.apple.com/videos/play/wwdc2023/10119/
- Jenkins remote API: https://www.jenkins.io/doc/book/using/remote-access-api/
- Jenkins advisory: https://www.jenkins.io/security/advisory/2024-01-24/
- Codex subagents: https://learn.chatgpt.com/docs/agent-configuration/subagents
- Codex worktrees: https://learn.chatgpt.com/docs/environments/git-worktrees

The evidence supports building with Vercel Sandbox. It does not establish a completed application, planner superiority, general containment, commercial validation or accepted incident continuity. Generic capture/replay, service revocation and stateless execution now have Vercel evidence; integrated Tripwire correlation and continuity job/state/authority acceptance remain untested.

## Latest primitive evidence — September 9 Vercel update

Historical [Solari transport/control probes](../planning-provenance.md#omitted-source-material) remain unchanged. Current [Vercel qualification](evidence/07-vercel-qualification/README.md) supplies independently collected provider evidence. Safari external-navigation integration remains untested; generic provider tests do not close M1. CLI remains the planned Astra transport.
