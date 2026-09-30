# One click, held before the destination

This is a controlled Chromium demonstration for one registered, owned HTTPS fixture. It runs in a disposable browser profile. It does not install anything into the user's regular browser or change the existing Safari extension.

The browser redirects the exact fixture navigation to an extension holding page before the destination request is sent. A lower-priority rule also blocks requests within that fixture's project path. The extension asks the local controller to inspect the fixed fixture ID in Solari. It shows the result and keeps the destination held, including when no finding is returned.

The trusted harness calls `buildControlledChromeDemo({ fixtureUrl, controllerOrigin, sourceOrigin }, directory)`, loads that directory as an unpacked extension, then invokes `globalThis.configure({ entryToken, expiresAt })` inside the extension service worker. The source origin is the exact loopback page that contains the test link; Chrome requires it to access the redirected holding page. The controller must independently authorize this exact extension and arm its bounded demo lease. No website or runtime message can configure the extension.

Configuration lasts at most 120 seconds. The token exists only in trusted extension session storage. Expiry removes inspection authority but leaves the scoped hold/block rules in place. Closing the disposable browser ends the active session; the private profile directory is retained with the qualification evidence. Trusted `globalThis.disarm()` is also available to explicitly remove only this extension's two session rules. A missing controller, malformed response, expired lease, or finding never adds an allow rule.

The holding page exposes `body[data-state="COMPLETE"]` and `data-classification` so the qualification harness can measure when the result becomes visible. This timestamp alone does not establish absence of destination traffic; the harness must collect separate network evidence and a successful unprotected baseline.

Chrome's [DNR documentation](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) describes evaluation before the request and session-rule lifetime. [Session storage](https://developer.chrome.com/docs/extensions/reference/api/storage) is explicitly restricted to trusted contexts. These API guarantees define the mechanism; live browser evidence establishes the tested case, not arbitrary-web coverage, complete host isolation, or safe-link release.
