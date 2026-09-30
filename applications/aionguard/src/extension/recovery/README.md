# Reversible test protection

AionGuard never puts macOS into Lockdown Mode and does not change the firewall, networking, login screen, keyboard routing, or kiosk settings. Protection consists of Safari session rules for one registered fixture directory/resource (or a legacy dedicated origin) and an explicitly armed controller lease, limited to five minutes. It starts disarmed.

Four consecutive `0` characters in ordinary macOS input request emergency release. The recovery listener is passive: it does not consume, replace, save, or transmit keystrokes. It stores one zero counter, ignores auto-repeat, and resets on other keys. AionGuard's extension pages also provide this shortcut and a visible disarm button.

## Build the containing app

From the repository root, choose a new output directory and an **existing** valid Apple Development signing identity:

```sh
src/extension/package-safari.sh https://your-owned-fixture.example runtime-data/safari-package '<existing-signing-identity>'
```

The script builds extension resources, runs Apple's converter, inserts the tracked recovery main and native handler, corrects the parent/extension bundle identifiers, compiles, and verifies the signed package. It retains App Sandbox for both targets, the containing app's loopback networking capability, and read-only user-selected file access. It never creates a signing account, exports a key, changes Safari settings, or enables the extension. Omitting the identity uses ad-hoc signing for source development; Safari may require a separate user-authorized unsigned-extension setting in that mode. The script does not change that setting.

The generated app is at `<output>/safari-build/Build/Products/Debug/AionGuard.app`. Its main executable supports:

```sh
<app>/Contents/MacOS/AionGuard --preflight
<app>/Contents/MacOS/AionGuard --probe-event-tap
<app>/Contents/MacOS/AionGuard --token-file /absolute/path/runtime-data/recovery-token --port 4317
```

With no arguments, the containing app opens its own Safari extension preferences. `--preflight` reads existing Input Monitoring and Secure Input state without prompting or monitoring. `--probe-event-tap` creates and immediately closes a passive tap without inspecting keyboard events. The recovery token is read only from a regular file owned by the current user without group/other access. When App Sandbox cannot read that exact supplied path, the app presents macOS's file picker to acquire access only to that file. Recovery startup waits until AppKit finishes launching; the app retains its delegate and selected-file access for the helper's lifetime. Canceling or choosing another path leaves recovery unavailable. No sandbox boundary is disabled.

The extension uses the separate `entry-token`. In extension settings, **pair from the local entry-token file**; the import goes directly to extension storage without rendering the credential. Never give the extension the full controller or recovery token.

## Native release and acknowledgment

The containing-app executable has the bundle identity required by `SFSafariApplication.dispatchMessage`. The extension establishes its Safari native port with `browser.runtime.connectNative` and retains the production port for the connection's lifetime, clearing it on disconnect. A fixed native emergency message removes static, dynamic, and session versions of AionGuard's own rules and moves held tabs to the neutral controller page. It then posts an authenticated acknowledgment containing the matching release request ID and the actual rules API result. Dispatch completion alone is never treated as rule-removal proof.

Static cleanup first queries enabled rulesets and disables the legacy `registered_fixture` only if enabled. This query/update is serialized because Safari can reject attempts to disable an already disabled ruleset. Dynamic and session removals proceed independently. Query or removal failure keeps the acknowledgment false, and a subsequent attempt can retry.

The helper also revokes the controller lease over loopback. Its heartbeat is unhealthy while that request is pending or while native rule-removal acknowledgment is missing. It observes controller release IDs, so UI disarm and expiry also trigger native release attempts. A failed controller request cannot keep a lease alive by continuing healthy heartbeats. Old responses cannot clear a newer release generation. A new lease always needs an explicit operator action.

The extension polls once per second while running, with a one-second timeout, and adds expiry/watchdog alarms. Missing leases, recovery loss, unavailable controllers, or malformed responses remove the rules. Native connection loss also disarms. Session-only rules clear on Safari quit. These recovery paths supplement one another.

**This is not an unconditional global keyboard guarantee.** macOS withholds keyboard events during Secure Input and protected system screens. A frozen OS cannot process a shortcut, and Safari may suspend or fail an extension background. A native port dispatch can also fail. The UI distinguishes controller disarm from acknowledged browser rule removal. If Safari cannot remove the rules, disable AionGuard in Safari Settings → Extensions or fully quit Safari. No unrelated macOS app or browsing origin is restricted by AionGuard.

## Device verification boundary — September 10, 2026

- At the earlier setup checkpoint, the signed containing app's Input Monitoring setting was on and Secure Input was off. The host confirmed its enabled `listenOnly` event tap in process 16190. Process IDs and permission state are session observations, not permanent configuration guarantees.
- Signed containing app: compiled with an existing Apple Development identity and verified against the host trust store, with App Sandbox retained. The normal Cocoa file picker completed the exact recovery-token grant, and recovery readiness remained true across observations.
- Standalone listener: real passive event tap received synthetic OS events sent only into an owned temporary Cocoa input window, then sent an authenticated disarm POST to an isolated receiver. The test rejected readiness loss and closed all test processes. This is synthetic event proof, not physical keyboard proof.
- Safari: the user manually enabled the development-signed AionGuard extension after the earlier click-interference rejection. Pairing with the exact local entry-token file works. The native release path produced a matching `rulesRemoved: true` acknowledgment while protection was off. No unsigned-extension exception was enabled.
- Initial physical keyboard check: the user typed `0000` in TextEdit and confirmed completion; a fresh release request and matching Safari `rulesRemoved: true` acknowledgment were recorded while protection was off. That initial check established physical delivery without testing installed-rule removal.
- AionPhish package: installed and paired, with a one-day Safari website-access grant for `https://mfrey18.github.io`. This browser permission covers the shared origin; session rules cover the registered project path.
- Lease expiry: after retaining the production native port, a repeated 20-second test observed rules 1 and 2 with the matching active lease, followed by an expired lease, empty Safari rules, and a fresh matching native acknowledgment. The earlier missing-acknowledgment attempt remains preserved.
- Connection lifetime: the retained production port stayed connected after a debugger-requested garbage collection with Web Inspector attached. This does not establish Safari background suspension or restart behavior.
- Armed physical recovery: Safari first showed rules 1 and 2 with the current lease. The user physically typed `0000` in TextEdit while Web Inspector was closed; Codex sent no zero keys. A fresh matching native acknowledgment arrived approximately 95.5 seconds before the lease deadline, and Safari subsequently showed no rules or applied lease. The controller was unarmed with recovery ready. Evidence is in `runtime-data/aionphish-preparation/physical-armed-recovery-confirmed.json`.
- Later recorded demonstration: a normal email-link click reached the holding page and real Vercel inspection. Automated `0000` input failed in the retry; explicit disarm received a matching rules-removal acknowledgment. This does not change the separate physical-input result above. See the [recorded checkpoint](../../../docs/integration-verification.md#recorded-safari-demonstration--subsequent-checkpoint).
- Still unverified: comprehensive navigation coverage, independently attributed local request suppression, and the Secure Input, suspension, restart, and controller/helper-loss matrix. The target preparation and recovery tests themselves did not launch an inspection.

A retained diagnostic native port received repeated correctly shaped release payloads while the original handler produced no acknowledgment. Retaining the production port resolved that failure in the repeated installed test. Private receipts `aionphish-preparation/retained-port-expiry.json`, `retained-port-expiry-observed.json`, and `retained-port-package-hashes.json` preserve the controller trace, Safari observations, and package hashes. Final source checks passed 263 tests across 14 files, TypeScript, production build, formatting, and diff checks. The earlier failed regex and recovery records remain separate from the successful result.

For a new installation, physically enable AionGuard in Safari Settings → Extensions after any click-interference condition has cleared. Grant only the registered fixture origin and loopback controller, pair the entry-token file, and select the exact recovery-token file when the containing app requests it. Enable Input Monitoring for the signed AionGuard app if its readiness check requires it. Keep protection disarmed until the helper and native acknowledgment are healthy. Before the first protected navigation, verify `0000` from an owned ordinary input window, confirm a fresh matching rules-removed acknowledgment, and confirm explicit rearming is required. Also verify helper/controller termination, Secure Input, lease expiry, Safari restart, and the disarm button.

## Standalone and synthetic test tools

```sh
src/extension/recovery/build.sh /private/tmp/aionguard-recovery-build
xcrun swiftc -parse-as-library -module-cache-path /private/tmp/aionguard-recovery-build/module-cache src/extension/recovery/EventProbe.swift -o /private/tmp/aionguard-recovery-build/event-probe -framework AppKit
python3 src/extension/recovery/test-native.py --helper /private/tmp/aionguard-recovery-build/aionguard-recovery --probe /private/tmp/aionguard-recovery-build/event-probe
```

The standalone binary is for HTTP recovery and isolated diagnostics. It does not impersonate the containing app or claim Safari native messaging. The explicit synthetic probe uses only a disposable token, isolated loopback receiver, and its own temporary input window; it never arms production protection.

References: [Apple passive event taps](https://developer.apple.com/documentation/coregraphics/cgeventtapoptions/listenonly), [Safari native messaging](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension), [Safari session rules](https://developer.apple.com/documentation/safariservices/blocking-content-with-your-safari-web-extension), [Running a Safari extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension).
