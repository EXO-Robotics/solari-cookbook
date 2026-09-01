# SmartCart × Solari

This example points to a native SmartCart product integration built in a separate public repository. The iOS application is intentionally not duplicated into the cookbook.

SmartCart already turns reviewed recipes into pantry-aware shopping requirements and preserves a user-controlled retailer handoff. The isolated product fork adds an explicit native **Research current options** action after pantry exclusion and before that handoff:

1. SmartCart supplies the fixed reviewed need: chicken 1.5 lb, penne 12 oz, and Parmesan 3 oz.
2. A protected SmartCart backend admits exactly six products from the owned synthetic Demo Grocer.
3. Solari Browser observes the JavaScript-rendered identity, package size, visible synthetic price, source, timestamp, and required current/synthetic markers.
4. Solari Sandbox evaluates the cross-line baskets and chooses the lowest-surplus adequate basket no more than `$0.75` above the cheapest adequate basket.
5. SmartCart verifies evidence membership, freshness, coverage, package/price arithmetic, cheapest reference, comparison arithmetic, and the premium cap without duplicating Sandbox's global optimizer.
6. The native review keeps the shopper in control. **Continue with original SmartCart list** finalizes only the original retailer matches; Demo Grocer IDs and prices never transfer.

The credentialed V3 run selected a `$13.32` synthetic basket instead of the `$12.79` cheapest adequate basket. The `$0.53` premium reduced package surplus from 31 oz to 15 oz, avoiding 16 oz of overbuy. That global price-versus-surplus decision is Solari Sandbox's necessary job.

## Exact implementation and proof

- Implementation repository: [`EXO-Robotics/smartcart-solari`](https://github.com/EXO-Robotics/smartcart-solari)
- Native beta branch: [`feat/native-solari-beta`](https://github.com/EXO-Robotics/smartcart-solari/tree/feat/native-solari-beta)
- Current publication commit: [`42ca83232c10d858b0da759290be510427bcf69a`](https://github.com/EXO-Robotics/smartcart-solari/commit/42ca83232c10d858b0da759290be510427bcf69a)
- Exact post-fix Grok-reviewed publication packet: [`bc083d6f56405aeac7b6d223fa85bac89be8815e`](https://github.com/EXO-Robotics/smartcart-solari/commit/bc083d6f56405aeac7b6d223fa85bac89be8815e)
- Exact qualified V3 runtime/deployment commit: [`772e65bac5cabfba8b5e8b6a9482191a715c616a`](https://github.com/EXO-Robotics/smartcart-solari/commit/772e65bac5cabfba8b5e8b6a9482191a715c616a)
- Credentialed V3 Browser + Sandbox run: [`33533170189`](https://github.com/EXO-Robotics/smartcart-solari/actions/runs/33533170189)
- V3 execution receipt: [`smartcart-solari-v3-qualification-33533170189.json`](https://github.com/EXO-Robotics/smartcart-solari/blob/main/evidence/live/smartcart-solari-v3-qualification-33533170189.json)
- Protected V3 backend deployment receipt: [`smartcart-solari-v3-deployment-772e65b-20260901.json`](https://github.com/EXO-Robotics/smartcart-solari/blob/main/evidence/live/smartcart-solari-v3-deployment-772e65b-20260901.json)
- Deployed API health: [`smartcart-solari-beta.vercel.app/health`](https://smartcart-solari-beta.vercel.app/health)
- Owned Browser surface and supporting evidence: [`SmartCart × Solari Pages`](https://exo-robotics.github.io/smartcart-solari/website/solari-demo/)

## Trust and distribution boundary

The credentialed run uses the owned, synthetic Demo Grocer—not Walmart or Target. Walmart remains dated fixture replay only. There is no retailer login, persistent Browser profile, cookie/session capture, cart modification, checkout, payment, or purchase automation. Solari and Upstash credentials remain server-side. Solari Desktop is absent because it has no necessary job.

The native code path, Simulator tests, unsigned Release configuration, protected backend, and credentialed Browser/Sandbox execution are demonstrated. A signed archive is currently blocked by Personal Team capability/provisioning and Share Extension app-group profile mismatches, and the available physical iPhone is offline. Signed App Attest execution, TestFlight, App Store, downloadable-native distribution, and value from an authorized real-retailer source remain **PENDING**.

The runtime receipt is pinned to `772e65b`; reviewed packet `bc083d6` adds only sanitized receipts, documentation, and supporting-site evidence. Current head `42ca832` only records the resulting internal review and Pages publication identity. Neither publication-only commit is presented as a second runtime qualification.
