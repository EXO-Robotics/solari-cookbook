# SmartCart × Solari

This cookbook reference points to a native SmartCart product integration maintained in a separate public repository. The iOS application is intentionally not duplicated into the cookbook.

SmartCart already turns reviewed recipes into pantry-aware shopping requirements and preserves a user-controlled retailer handoff. The Solari-enhanced fork adds one optional step before that handoff:

1. SmartCart supplies eligible post-pantry ingredient requirements and exact allowlisted product candidates.
2. Solari Browser observes JavaScript-rendered identity, package, visible synthetic price, source, time, freshness, confidence, and ambiguity from the owned Demo Grocer.
3. Solari Sandbox evaluates complete baskets under a fixed policy: minimize aggregate relative package surplus while spending no more than `$0.75` above the cheapest adequate basket.
4. SmartCart independently verifies evidence membership, coverage, arithmetic, freshness, cheapest reference, and premium cap.
5. The native app presents the recommendation and returns control to the shopper. Demo Grocer products and prices never enter a retailer cart or checkout.

The credentialed V4 run researched **8 requirements** from **16 Browser observations**. Sandbox selected a synthetic **$24.20** basket instead of the **$23.57** cheapest adequate basket, spending **$0.63** to avoid about **680 g / 1.5 lb of excess chicken**.

## Start here

- [Interactive before/after case study](https://exo-robotics.github.io/smartcart-solari/)
- [Tagged submission](https://github.com/EXO-Robotics/smartcart-solari/releases/tag/solari-submission-v1.0.0)
- [Implementation repository](https://github.com/EXO-Robotics/smartcart-solari)
- [Final main commit `335bc39`](https://github.com/EXO-Robotics/smartcart-solari/commit/335bc39be5227d5457679821b36d79c5cdc1e942)
- [Credentialed Browser + Sandbox run `33546912947`](https://github.com/EXO-Robotics/smartcart-solari/actions/runs/33546912947)
- [Sanitized V4 receipt](https://github.com/EXO-Robotics/smartcart-solari/blob/solari-submission-v1.0.0/evidence/live/smartcart-solari-v4-qualification-33546912947.json)
- [Successful Pages release run `33583035418`](https://github.com/EXO-Robotics/smartcart-solari/actions/runs/33583035418)
- [Protected backend health](https://smartcart-solari-beta.vercel.app/health)

## Evidence boundary

The credentialed provider run uses the repository-owned synthetic Demo Grocer—not Walmart, Target, or another commercial retailer. Walmart remains historical fixture replay only. There is no retailer login, persistent Browser profile, cookie capture, cart mutation, checkout, payment, or autonomous purchase. Solari and state-store credentials remain server-side. Solari Desktop is absent because it has no necessary job.

The native Simulator flow, unsigned beta build, protected backend, and credentialed Browser/Sandbox execution are demonstrated separately. Signed physical-device App Attest, TestFlight, App Store distribution, downloadable-native distribution, authorized commercial-retailer research, guaranteed consumer pricing, and product-market fit remain **PENDING**.
