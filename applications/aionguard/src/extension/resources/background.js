/* global browser, AIONGUARD */
const RULE_IDS = [1, 2];
let generation = 0;
let ticking = false;
let localRecoveryLatched = false;
let appliedLeaseId = null;
let nativeConnected = false;
// Keep a strong reference for the background context's native connection lifetime.
let nativePort = null;
let staticRuleCleanup = Promise.resolve();
const holdingUrl = browser.runtime.getURL('hold.html');
const settingsUrl = browser.runtime.getURL('options.html');

async function entryToken() {
  const { entryToken: value } = await browser.storage.local.get('entryToken');
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,256}$/.test(value) ? value : null;
}
async function controllerRequest(path, method = 'GET', payload = {}) {
  const token = await entryToken();
  if (!token) throw new Error('PAIRING_REQUIRED');
  return fetch(`${AIONGUARD.controllerOrigin}${path}`, {
    method,
    redirect: 'error',
    cache: 'no-store',
    credentials: 'omit',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(1_000),
  });
}
function removeLegacyStaticRules() {
  // Safari can reject disabling a ruleset that is already disabled. Keep the
  // read and update together so concurrent recovery requests cannot race here.
  const removal = staticRuleCleanup.then(async () => {
    const enabled = await browser.declarativeNetRequest.getEnabledRulesets();
    if (enabled.includes('registered_fixture'))
      await browser.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: ['registered_fixture'],
      });
  });
  // Report this attempt's failure without preventing a subsequent recovery retry.
  staticRuleCleanup = removal.catch(() => {});
  return removal;
}
async function removeRules() {
  // Also remove old static/dynamic versions during an upgrade. New protection is session-only.
  const results = await Promise.allSettled([
    removeLegacyStaticRules(),
    browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds: RULE_IDS }),
    browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: RULE_IDS }),
  ]);
  if (results.some((result) => result.status === 'rejected'))
    throw new Error('RULE_REMOVAL_FAILED');
  appliedLeaseId = null;
}
async function releaseHoldingTabs() {
  const tabs = await browser.tabs.query({ url: holdingUrl });
  await Promise.all(
    tabs
      .filter((tab) => tab.url === holdingUrl && Number.isInteger(tab.id))
      .map((tab) =>
        browser.tabs.update(tab.id, { url: `${AIONGUARD.controllerOrigin}/?protection=disarmed` }),
      ),
  );
}
async function disarm() {
  generation += 1;
  localRecoveryLatched = true;
  const results = await Promise.allSettled([
    browser.storage.local.set({ recoveryLatched: true }),
    removeRules(),
    controllerRequest('/api/protection/disarm', 'POST'),
    releaseHoldingTabs(),
  ]);
  // A failed rules API must never be reported as recovered.
  return {
    ok: results[1].status === 'fulfilled',
    reason: results[1].status === 'fulfilled' ? 'DISARMED' : 'DISABLE_EXTENSION_REQUIRED',
  };
}
async function syncProtection() {
  if (ticking) return;
  ticking = true;
  const startedGeneration = generation;
  try {
    const response = await controllerRequest('/api/protection');
    if (!response.ok) throw new Error('UNAVAILABLE');
    const text = await response.text();
    if (text.length > 2048) throw new Error('INVALID_STATE');
    const state = JSON.parse(text);
    if (startedGeneration !== generation) return;
    const now = Date.now();
    const valid =
      state.armed === true &&
      nativeConnected &&
      state.recoveryReady === true &&
      typeof state.leaseId === 'string' &&
      /^[A-Za-z0-9_-]{1,100}$/.test(state.leaseId) &&
      Number.isSafeInteger(state.expiresAt) &&
      state.expiresAt > now &&
      state.expiresAt <= now + 300_000;
    if (!valid || localRecoveryLatched) {
      await removeRules();
      await releaseHoldingTabs();
      if (state.armed === false) {
        localRecoveryLatched = false;
        await browser.storage.local.set({ recoveryLatched: false });
      } else {
        localRecoveryLatched = true;
        await browser.storage.local.set({ recoveryLatched: true });
        await controllerRequest('/api/protection/disarm', 'POST');
      }
      return;
    }
    if (appliedLeaseId !== state.leaseId) {
      await browser.declarativeNetRequest.updateSessionRules({
        removeRuleIds: RULE_IDS,
        addRules: AIONGUARD.rules,
      });
      if (startedGeneration !== generation) {
        await removeRules();
        return;
      }
      appliedLeaseId = state.leaseId;
      await browser.alarms.create('aionguard-expiry', { when: state.expiresAt });
    }
  } catch {
    // Availability is never allowed to trap the user's browsing in the test protection state.
    await disarm();
  } finally {
    ticking = false;
  }
}

browser.runtime.onMessage.addListener(async (message, sender) => {
  const ownPage =
    sender.id === browser.runtime.id && (sender.url === holdingUrl || sender.url === settingsUrl);
  if (
    ownPage &&
    message &&
    Object.keys(message).join(',') === 'type' &&
    message.type === 'EMERGENCY_DISARM'
  )
    return disarm();
  if (
    ownPage &&
    message &&
    Object.keys(message).join(',') === 'type' &&
    message.type === 'SYNC_PROTECTION'
  ) {
    await syncProtection();
    return { ok: true, armed: appliedLeaseId !== null };
  }
  if (
    sender.id !== browser.runtime.id ||
    sender.url !== holdingUrl ||
    !sender.tab ||
    !message ||
    Object.keys(message).sort().join(',') !== 'fixtureId,requestId,type' ||
    message.type !== 'INSPECT_REGISTERED_FIXTURE' ||
    message.fixtureId !== AIONGUARD.fixtureId ||
    typeof message.requestId !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(message.requestId)
  )
    return { ok: false, reason: 'INVALID_COMMAND' };
  const token = await entryToken();
  if (!token) return { ok: false, reason: 'PAIRING_REQUIRED' };
  try {
    const response = await fetch(`${AIONGUARD.controllerOrigin}/api/entry`, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fixtureId: AIONGUARD.fixtureId, requestId: message.requestId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 409) return { ok: false, reason: 'AUTHORIZATION_REQUIRED' };
    if (!response.ok)
      return {
        ok: false,
        reason: response.status === 401 ? 'PAIRING_REQUIRED' : 'CONTROLLER_UNAVAILABLE',
      };
    const text = await response.text();
    if (text.length > 2048) return { ok: false, reason: 'INVALID_RESPONSE' };
    const result = JSON.parse(text);
    if (typeof result.runId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(result.runId))
      return { ok: false, reason: 'INVALID_RESPONSE' };
    return { ok: true, runId: result.runId };
  } catch {
    return { ok: false, reason: 'CONTROLLER_UNAVAILABLE' };
  }
});
// Only Safari's containing-app native port reaches this callback. Page messages
// continue through the strict onMessage sender boundary above.
try {
  nativePort = browser.runtime.connectNative('com.aionguard.integration');
  nativeConnected = true;
  nativePort.onMessage.addListener(async (message) => {
    const payload = message?.userInfo ?? message?.message ?? message;
    if (
      !payload ||
      Object.keys(payload).sort().join(',') !== 'requestId,type' ||
      payload.type !== 'EMERGENCY_DISARM' ||
      typeof payload.requestId !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(payload.requestId)
    )
      return;
    const result = await disarm();
    try {
      await controllerRequest('/api/protection/extension-ack', 'POST', {
        requestId: payload.requestId,
        rulesRemoved: result.ok,
      });
    } catch {
      /* No acknowledgment is claimed when the controller is unavailable. */
    }
  });
  nativePort.onDisconnect.addListener(() => {
    nativeConnected = false;
    nativePort = null;
    void disarm();
  });
} catch {
  nativeConnected = false;
  nativePort = null;
  void disarm();
}

browser.alarms.onAlarm.addListener((alarm) => {
  // Re-check the current lease: an old queued expiry must not revoke a new lease.
  if (alarm.name === 'aionguard-expiry' || alarm.name === 'aionguard-watchdog')
    void syncProtection();
});
browser.runtime.onStartup.addListener(() => {
  void disarm();
});
browser.runtime.onInstalled.addListener(() => {
  void disarm();
});
browser.storage.onChanged.addListener(() => {
  void syncProtection();
});
// Timers are best effort when Safari suspends extension backgrounds. The alarm and
// session-only rules supply additional recovery; browser quit clears session rules.
void browser.alarms.create('aionguard-watchdog', { periodInMinutes: 1 });
const startup = browser.storage.local.get('recoveryLatched').then(({ recoveryLatched }) => {
  localRecoveryLatched = recoveryLatched === true;
  return syncProtection();
});
setInterval(syncProtection, 1_000);

startup;
