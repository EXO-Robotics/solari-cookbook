# Contributing to AionGuard

AionGuard's Phase 1 core is implemented. Live endpoint/provider acceptance and demonstration work remain a separate gate. Start with [setup instructions](docs/setup.md).

Read the [current build decisions](docs/build-decisions.md), [plan](docs/planning/plan.md), and [README](README.md) before proposing work. Keep changes focused on the active delivery phase and explain which evidence supports any new capability claim.

Use synthetic data and owned, authorized fixtures. Keep credentials, environment files, authenticated browser state, raw decoys, and private provider artifacts out of commits and public discussions. Report security concerns using [SECURITY.md](SECURITY.md).

For code contributions, describe the problem, resulting behavior, relevant validation, and known limitations. Include failure cases when they affect evidence validity, authorization, spending, or cleanup. Preserve historical evidence; append a new run or correction instead of rewriting an old receipt.

Use Node 24 and npm. Run `npm ci`, `npm run check`, and `npm run format:check`. Tests and CI use injected software providers and do not need account credentials. `npm run compare` checks deterministic policies only; do not add live model or Vercel calls to the default suite. Changes to shared contracts should update consumers together and preserve source/mode labels.

Identify the component license before contributing. Existing MIT baseline components retain MIT. New source-available components must be expressly identified in [LICENSING-COVERAGE.json](LICENSING-COVERAGE.json); prospective contributors must agree in writing to the applicable outbound terms and commercial-licensing authority before those contributions are accepted. Contributors retain ownership unless separately agreed in writing. This policy does not retroactively bind past contributors or assign copyright.

Preserve third-party notices and identify imported or generated material. [Commercial licensing](COMMERCIAL-LICENSING.md) · [Authorship](AUTHORS.md) · [Megan's licensing authority](docs/licensing/LICENSING-AUTHORITY.md).
