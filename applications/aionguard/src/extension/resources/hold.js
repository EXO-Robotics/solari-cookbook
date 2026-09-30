/* global browser, AIONGUARD */
const status = document.getElementById('status');
const key = 'aionguard-entry-request';
// Reload retries use the same id so uncertain responses cannot silently create another attempt.
const navigation = performance.getEntriesByType('navigation')[0];
let requestId = navigation?.type === 'reload' ? sessionStorage.getItem(key) : null;
if (!requestId) {
  requestId = crypto.randomUUID();
  sessionStorage.setItem(key, requestId);
}
browser.runtime
  .sendMessage({ type: 'INSPECT_REGISTERED_FIXTURE', fixtureId: AIONGUARD.fixtureId, requestId })
  .then((result) => {
    if (result?.ok === true && /^[A-Za-z0-9_-]{1,100}$/.test(result.runId)) {
      sessionStorage.removeItem(key);
      status.textContent = 'Inspection dispatched. Opening the evidence workspace.';
      location.replace(`${AIONGUARD.controllerOrigin}/?run=${encodeURIComponent(result.runId)}`);
      return;
    }
    const messages = {
      PAIRING_REQUIRED:
        'Pair this extension with AionGuard in extension settings, then reload this page.',
      AUTHORIZATION_REQUIRED:
        'Open AionGuard and authorize a fresh attempt before inspecting this registered fixture.',
    };
    status.textContent =
      messages[result?.reason] ?? 'The controller is unavailable. This navigation remains blocked.';
  })
  .catch(() => {
    status.textContent = 'Inspection is unavailable. This navigation remains blocked.';
  });
