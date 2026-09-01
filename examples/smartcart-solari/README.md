# SmartCart × Solari

This example points to a real SmartCart product integration built in a separate repository. The iOS app is intentionally not duplicated into the cookbook.

SmartCart already turns reviewed recipes into pantry-aware shopping requirements and preserves a user-controlled retailer handoff. The experimental fork adds an explicit native **Research current options** step before that handoff:

1. SmartCart supplies one to three reviewed post-pantry requirements.
2. A protected SmartCart backend admits only server-derived products from an owned synthetic Demo Grocer.
3. Solari Browser observes JavaScript-rendered product identity, package, visible price, source, and timestamp.
4. Solari Sandbox normalizes units and chooses sufficient package quantities.
5. SmartCart independently validates the evidence and math, shows a native basket review, and leaves the final retailer open to the user.

## Exact implementation and proof

- Implementation repository: [`EXO-Robotics/smartcart-solari`](https://github.com/EXO-Robotics/smartcart-solari)
- Native beta branch: [`feat/native-solari-beta`](https://github.com/EXO-Robotics/smartcart-solari/tree/feat/native-solari-beta)
- Current publication commit: [`3d39dbb77a16a534a74bd031379def75360c71d4`](https://github.com/EXO-Robotics/smartcart-solari/commit/3d39dbb77a16a534a74bd031379def75360c71d4)
- Exact runtime/deployment implementation: [`eee8c840b59def4428548c66203304193fa93520`](https://github.com/EXO-Robotics/smartcart-solari/commit/eee8c840b59def4428548c66203304193fa93520)
- Credentialed Browser + Sandbox run: [`33519606791`](https://github.com/EXO-Robotics/smartcart-solari/actions/runs/33519606791)
- Solari execution receipt: [`smartcart-solari-live-proof-33519606791.json`](https://github.com/EXO-Robotics/smartcart-solari/blob/feat/native-solari-beta/evidence/live/smartcart-solari-live-proof-33519606791.json)
- Protected backend deployment receipt: [`smartcart-solari-beta-deployment-20260901.json`](https://github.com/EXO-Robotics/smartcart-solari/blob/feat/native-solari-beta/evidence/live/smartcart-solari-beta-deployment-20260901.json)
- Deployed API health: [`smartcart-solari-beta.vercel.app/health`](https://smartcart-solari-beta.vercel.app/health)

## Trust boundary

The credentialed run uses the owned, synthetic Demo Grocer—not Walmart or Target. Walmart remains a dated replay only. There is no retailer login, persistent Browser profile, cookie/session capture, cart modification, checkout, payment, or purchase automation. Solari and Redis credentials remain server-side. Solari Desktop is not used because the workflow has no legitimate desktop task.

The signed native App Attest flow, physical-iPhone execution, TestFlight distribution, and an authorized real-retailer source remain pending. The repository does not claim a downloadable beta or current third-party retailer prices.

