# Isolation and interception handoff

Implemented the Phase 1 registered-fixture inspector, passive guest worker, SDK adapter, static Safari extension resource generator, trusted holding/settings pages, inert Acme fixture, and a separately guarded clean-image preparation script.

The module entry point is `src/server/isolation/index.ts`. Construct `VercelInspector` with a validated configuration or `null` for an unavailable LIVE service. The optional injected `IsolationProvider` enables software failure tests without any provider dispatch. `createMockInspector()` is explicitly labeled MOCK. The extension posts `{fixtureId, requestId}` to `http://127.0.0.1:4317/api/entry` using the separate extension entry token; no destination URL or authorization grant crosses this command boundary.

Checks: TypeScript checking and isolated policy/provider/worker/extension tests pass. Tests cover exact-origin comparisons, output poisoning, cross-origin redirect metadata, stale observations, PNG envelope validation, no provider secrets in guest writes, creation ambiguity, terminal-stop/deletion order, capacity retained after incomplete cleanup, extension sender/payload validation, and fresh-versus-retry request IDs. The extension package is generated into a disposable local test directory; no Safari registration or device settings were changed.

No live Vercel VM, snapshot, fixture deployment, GitHub Pages entry, Safari installation, provider-backed inspection, model interaction, or presentation was performed. Real no-local-load coverage, provider latency/quota, guest dependency installation and cleanup timing remain deferred. The public holding resource can be opened directly; its message is a reported handoff, not interception proof. Snapshot approval is operator-declared, not independent attestation. The fixed document revision check binds metadata to the worker's PNG capture but cannot attest a maliciously replaced worker.

Current source references and later setup boundaries are documented beside the isolation module and extension resources. The clean-image script is new source for this project; it does not reuse the historical provider probe implementation or images.
