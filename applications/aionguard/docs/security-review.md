# Core security review

The implementation received independent native-agent reviews and a read-only Grok design advisory. Grok received only an authored, sanitized design summary in a separate directory; web search, subagents and mutation tools were disabled. Its findings were treated as hypotheses and checked against source and tests.

Accepted and verified:

- Separate entry and operator tokens. The extension cannot read case data or invoke the full control API with its entry token.
- Strict Host/Origin and body/schema checks, including origin-less requests still requiring a bearer token. The server binds only to loopback.
- Revision changes cannot overlap a running case command. Broker reservation is synchronous, retries are payload-bound, failed collections preserve spending, and evidence from a changed in-flight identity is rejected.
- Inspected final URLs, redirects, declared form origin and bounded PNG envelope are validated. The controller independently rejects missing success metadata; a native review reproduced and prompted a fix for a malformed PNG/metadata acceptance gap.
- Carry-forward cannot promote old CLI facts to a changed revision. Successful fresh verification must cite its own paid operator receipt; an unrelated falsifier cannot manufacture verification.
- The model receives reconstructed enum/typed synthetic facts. Page marker tests inspect actual serialized application request bytes, including the CLI adapter input. Model rationale is recorded as rationale and never becomes an observation or a future model-input fact.
- Stopping early or exhausting credits cannot make an unresolved hypothesis disappear. The current state and preserved baseline are distinct.

Recorded for the deferred live gate:

- A web-accessible extension holding page can be opened directly. Its handoff is a report, not cryptographic proof of request interception. The complete Safari request-class/profile/permission matrix needs endpoint measurement.
- Installed CLI version, ignored flags, ambient global skills and child-process behavior need real transport acceptance. Offline process tests detect tool events and validate timeout/output handling, but do not prove all external CLI ambient context is absent.
- Snapshot cleanliness is an operator declaration bound to a snapshot ID, source revision and browser pin. It is not independent attestation of a compromised controller or worker.
- Process crashes lose in-memory cases and cleanup reservations. Remote resources must be reconciled before restarting a LIVE session. Provider expiry is not immediate terminal-state proof.

Not added: arbitrary target discovery, real Jenkins log ingestion, real credentials, kernel/escape testing, external notifications, generalized IAM controls, multi-tenant storage, or independent signing infrastructure. Those advisory ideas either assume systems outside this bounded synthetic case or exceed the plan's scope.

The accepted controls support the tested application boundaries. They do not certify general prompt-injection immunity, universal link protection, physical endpoint containment, production security or scale.

The synthetic fixture implementation is public source code. “Private truth” means facts withheld from the runtime planner and client until a bounded collector returns them; it does not mean those reproducible scenario values are secret from a person reading this repository. The runtime model has no repository-reading role.
