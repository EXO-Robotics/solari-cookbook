# SmartCart basket research (TypeScript)

A deliberately small version of SmartCart's useful Solari seam:

1. Solari Browser opens three fixed, JavaScript-rendered chicken pages on SmartCart's owned Demo Grocer.
2. The example emits `retailer-observation-v1` evidence with product identity, package mass, visible synthetic price, source URL, and timestamp.
3. Solari Sandbox chooses the lowest-surplus adequate package within `$0.75` of the cheapest adequate option.
4. The caller verifies evidence membership, coverage, line price, and the premium cap before printing `basket-decision-v1`.

For the reviewed 1.5 lb requirement, the synthetic cheapest package costs `$8.13`. The lower-surplus package costs `$8.76`: `$0.63` more to avoid about `1.5 lb` of excess chicken.

## Run

```bash
npm install
export SOLARI_API_KEY=slr_live_...
npm start
```

The key is read only from the process environment. The program creates a fresh logged-out Browser and a short-lived Sandbox, then releases both in `finally`. It does **not** use a profile, proxy, stealth, CAPTCHA handling, Desktop, retailer account, cart, or checkout.

These are owned synthetic prices, not Walmart, Target, or other commercial-retailer observations. See the [full SmartCart implementation](https://github.com/EXO-Robotics/smartcart-solari) and its [human-readable verified run](https://exo-robotics.github.io/smartcart-solari/verified-run.html) for the eight-requirement integration.
