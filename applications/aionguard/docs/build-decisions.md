# Current build decisions

Recorded September 10, 2026, from the project owner's instructions. These decisions supersede conflicting requirements in the preserved September 9 planning bundle.

Latest instruction: consolidate the tested implementation into the default GitHub branch and polish the hackathon submission. The owner subsequently authorized Safari setup, reversible live testing, recording, and narration editing. The original demo deferral has been superseded. See the [submission overview](submission.md) and [integration record](integration-verification.md) for completed evidence and remaining gates.

| Area | Current decision |
| --- | --- |
| Build authorization | The owner confirmed the project is good to proceed. This records owner authorization, not independent verification of organizer policies or endorsement. |
| Demonstration endpoint | Use the current Mac as the intended demonstration machine. |
| Click entry point | A normal link click on a GitHub Pages page is acceptable. The controlled Apple Mail route remains an option rather than a mandatory release prerequisite. |
| GitHub | Create the public `EXO-Robotics/AionGuard` repository and include the supplied planning material. |
| License | Source-available application terms; personal/internal use is free and commercial distribution requires separate permission under the application license. |
| Provider budget | Use the existing free Vercel account until the testing allowance is exhausted or unavailable, then pause provider-backed dispatch and report the blocker to the owner. Do not purchase or upgrade a plan or enable paid overages automatically. |
| Presentation | Present AionGuard as a product intended to scale, with this hackathon submission explicitly identified as the bounded implementation. Scalability and production readiness remain unverified until measured. |

## Revised first integration gate

The accepted primary path is now: GitHub Pages entry page → normal registered-link click → protected Safari navigation → trusted hold → fresh Vercel inspection → deterministic block → authorized Astra investigation → brokered observation → evaluator → case snapshot.

The Pages entry page is allowed to load locally. The inspected destination must remain excluded from local loading within the declared interception scope. A dashboard button that bypasses the protected navigation does not establish that boundary. Merely hosting a link on GitHub Pages does not prove interception or remote dispatch.

Repeat the integrated path from two fresh attempts, preserve failures and manual interventions, and record the actual origin and interception coverage. If the Mail route is demonstrated, label and verify it separately. All remaining Phase 1 evidence, budget, revision, receipt, model-input, and failure semantics continue to apply.

## Unchanged sequencing

Complete Phase 1 before Tripwire; complete Tripwire and its negative controls before any continuity experiment. Preserve runnable releases and the final-hour rehearsal reserve. Provider primitive evidence cannot substitute for integrated product acceptance.

The initial repository publication consumes no Vercel testing allowance and does not deploy an application. Actual account quota, usage visibility, event model access, extension configuration, and end-to-end timing remain kickoff checks.


## Astra product direction clarification

The owner clarified the submission narrative: Astra is a future incident-response upgrade that spawns after a phishing attempt, gathers incident data, drafts an email notifying IT, and investigates possible sandbox leaks. This workflow is not implemented or demonstrated. Prior bounded Astra adapter tests remain historical backend evidence and must not be presented as proof of the planned upgrade. Continuity remains future work. This clarification updates presentation scope; it does not implement the agent, send email, or claim sandbox-leak detection.


## Tripwire and continuity product direction

The owner clarified Tripwire's product purpose: investigate whether credentials captured in a phishing attempt were subsequently used in a likely harmful way. The original owned-lab decoy and replay scenario is a proposed way to validate this capability, not its complete product definition.

Continuity is intended for a phished device that hosts systems the business needs. Astra would identify and recover the necessary systems, dependencies, and state into a secured microVM so essential business operations can continue while the affected device and compromise remain contained. IT could investigate and restore the original device in parallel. Recovery would require validating the reconstructed systems, inputs, isolation, permissions, and output before resuming work.

Both capabilities remain planned and unimplemented in this submission. The archived one-workload scenario is the proposed first validation step, not a limit on the broader business-continuity vision. Historical planning and test receipts remain unchanged; these clarifications describe intended product behavior rather than new implementation or proof of safe recovery.


## Provider history and separate local VM

The owner requested that the submission record the original intent to use Solari and its reported unavailability during the build. Vercel Sandbox powers the recorded submission. This history does not assert current Solari service status.

The team also built a separate local Apple Silicon VM prototype. The supplied review reports browser rendering, screenshots, fresh instances, cleanup, and timeout recovery, but identifies destination/classification mismatches, a missing application adapter, Mac-side document fetching, unavailable external resources, and roughly 35 seconds of execution plus disk verification. It is not an integrated Vercel replacement. See the [provider compatibility notes](submission.md#provider-history-and-local-vm). This update publishes documentation only, not the separate VM source or new VM qualification evidence.


## Separate local VM source publication

At the owner's request, the source-only local VM project is published as [EXO-Robotics/AionGuard-Local-VM](https://github.com/EXO-Robotics/AionGuard-Local-VM) under its separate license. It contains the raw ARM64 monitor and macOS browser VM, tests, setup documentation, and historical reports with their evidence limits. Guest disks, credentials, approvals, binaries, quarantined state, and private runtime receipts are excluded. This publication does not integrate it into AionGuard or replace Vercel.
