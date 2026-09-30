# Release-path review

The owner requested background-check semantics: completed live inspection with no findings opens the page; findings block; failed/incomplete checks remain held. No trusted-site allowlist was added, and the UI does not call a released site safe.

A read-only Grok review covered the controller policy and Chromium handoff. Codex checked its findings against code, tests and [Chrome's DNR reference](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest).

Accepted and fixed:

- The fallback block lacked explicit resource types. Chrome excludes main-frame requests by default; the block now explicitly includes them, so query/path variants cannot bypass it.
- Stale holding-page navigation events must not clear a pending destination grant. Cleanup now matches the destination URL and frame.
- Worker restart clears interrupted navigation grants without restoring consumed authority.
- Release re-fetches controller status inside the serialized mutation, preventing a queued stale response from opening after an observed revocation.

Not adopted:

- Adding `<all_urls>` host access. The manifest uses `declarativeNetRequest`, which permits block rules without host permission; redirect permissions remain scoped. Grok's claim applied the `declarativeNetRequestWithHostAccess` restriction to the new permission.
- Multiple simultaneous grants. This controlled adapter admits one armed inspection at a time; multi-destination browser deployment is separate work.
- Restoring consumed authority after uncertain navigation failure. A fresh inspection is required; automatic replay could duplicate a navigation already sent.

The software tests cover URL/run/request/tab/document substitution, grant expiry, duplicate release, revocation, navigation failure and cleanup. Live fixture results are recorded separately in [link-release.md](link-release.md). A review is not proof of general containment or detection accuracy.
