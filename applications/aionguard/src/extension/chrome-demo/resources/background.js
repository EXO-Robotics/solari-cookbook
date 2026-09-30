importScripts('config.js');

const config = globalThis.AIONGUARD_CHROME;
const holdUrl = chrome.runtime.getURL('hold.html');
const ruleIds = config.rules.map((rule) => rule.id);
const alarmName = 'controlled-click-expiry';
const releaseAlarm = 'controlled-release-expiry';
const releaseRuleIds = [7103, 7104];
const pending = new Map();
const aborts = new Set();
let mutation = Promise.resolve();

const exactKeys = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const uuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const runId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const held = () => ({ ok: false, state: 'ERROR', error: 'Navigation remains held.' });

function serialize(task) {
  const result = mutation.then(task);
  mutation = result.catch(() => undefined);
  return result;
}

async function clearRelease(keepAssets = false) {
  // Restore the hold before dropping the record. Failure retains retry information.
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: keepAssets ? releaseRuleIds : [...releaseRuleIds, 7105],
  });
  const { release } = await chrome.storage.session.get('release');
  if (keepAssets && release) await chrome.storage.session.set({ assetTab: release.tabId });
  else await chrome.storage.session.remove(['assetTab']);
  await chrome.storage.session.remove(['release']);
  await chrome.alarms.clear(releaseAlarm);
}

async function revoke() {
  await clearRelease();
  await chrome.storage.session.remove(['lease', 'requests']);
  for (const abort of aborts) abort.abort();
  pending.clear();
  await chrome.alarms.clear(alarmName);
}

// Only the trusted disposable-browser harness can call this worker global.
// No runtime message, website, or content script can configure credentials or rules.
globalThis.configure = (value) =>
  serialize(async () => {
    if (
      !exactKeys(value, ['entryToken', 'expiresAt']) ||
      typeof value.entryToken !== 'string' ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(value.entryToken) ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt <= Date.now() ||
      value.expiresAt > Date.now() + 120000
    )
      throw new Error('Invalid bounded demo configuration');
    await revoke();
    await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    // Install the hold before accepting an inspection. Failure never adds an allow rule.
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: ruleIds,
      addRules: config.rules,
    });
    try {
      await chrome.storage.session.set({
        lease: { ...value, generation: crypto.randomUUID() },
        requests: {},
      });
      await chrome.alarms.create(alarmName, { when: value.expiresAt });
    } catch {
      await revoke();
      throw new Error('Demo configuration failed; fixture remains held');
    }
    return { armed: true, expiresAt: value.expiresAt };
  });

globalThis.disarm = () =>
  serialize(async () => {
    await revoke();
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ruleIds });
    return { armed: false };
  });

async function activeLease() {
  const { lease } = await chrome.storage.session.get('lease');
  if (!lease || !Number.isSafeInteger(lease.expiresAt) || lease.expiresAt <= Date.now()) {
    // Expiry revokes authority, but deliberately leaves the scoped hold rules installed.
    // Closing this disposable profile or trusted disarm ends the demonstration.
    return null;
  }
  return lease;
}

async function sameLease(lease) {
  return (await activeLease())?.generation === lease.generation;
}

async function validSender(sender) {
  if (
    sender.id !== chrome.runtime.id ||
    sender.url !== holdUrl ||
    sender.frameId !== 0 ||
    sender.documentLifecycle !== 'active' ||
    typeof sender.documentId !== 'string' ||
    !sender.documentId ||
    !Number.isInteger(sender.tab?.id) ||
    sender.tab.id < 0
  )
    return false;
  try {
    // Chrome omits tab.url from tabs.get without broad tab permissions. Its
    // own-extension context registry proves the exact live document instead.
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['TAB'],
      documentIds: [sender.documentId],
      documentUrls: [holdUrl],
    });
    return (
      contexts.length === 1 &&
      contexts[0].documentId === sender.documentId &&
      contexts[0].documentUrl === holdUrl &&
      contexts[0].tabId === sender.tab.id &&
      contexts[0].frameId === 0
    );
  } catch {
    return false;
  }
}

async function controllerRequest(path, lease, init = {}) {
  const abort = new AbortController();
  aborts.add(abort);
  const timeout = setTimeout(() => abort.abort(), Math.min(10000, lease.expiresAt - Date.now()));
  try {
    const response = await fetch(config.controllerOrigin + path, {
      ...init,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lease.entryToken}` },
      signal: abort.signal,
    });
    const current = await activeLease();
    if (!current || current.generation !== lease.generation || !response.ok)
      throw new Error('Unavailable');
    const body = await response.json();
    if (!(await sameLease(lease))) throw new Error('Unavailable');
    return { body, status: response.status };
  } finally {
    clearTimeout(timeout);
    aborts.delete(abort);
  }
}

async function inspect(message, sender, lease) {
  const { requests = {} } = await chrome.storage.session.get('requests');
  if (!(await sameLease(lease))) return held();
  const existing = requests[message.requestId];
  if (existing)
    return existing.tabId === sender.tab.id && existing.documentId === sender.documentId
      ? existing.result
      : held();
  if (Object.keys(requests).length >= 32) return held();
  const { body, status } = await controllerRequest('/api/controlled-click/entry', lease, {
    method: 'POST',
    body: JSON.stringify({ fixtureId: config.fixtureId, requestId: message.requestId }),
  });
  if (status !== 202 || !runId(body.runId)) return held();
  const result = { ok: true, state: 'CHECKING', requestId: message.requestId, runId: body.runId };
  // Commit alongside configuration/disarm, so an old response cannot repopulate
  // request ownership after a lease has been replaced or revoked.
  return serialize(async () => {
    const latest = await chrome.storage.session.get('requests');
    if (!(await sameLease(lease))) return held();
    await chrome.storage.session.set({
      requests: {
        ...latest.requests,
        [message.requestId]: { tabId: sender.tab.id, documentId: sender.documentId, result },
      },
    });
    return (await sameLease(lease)) ? result : held();
  });
}

async function handle(message, sender) {
  if (
    !exactKeys(message, ['type', 'requestId']) ||
    !uuid(message.requestId) ||
    !['INSPECT', 'STATUS', 'RELEASE'].includes(message.type) ||
    !(await validSender(sender))
  )
    return held();
  const lease = await activeLease();
  if (!lease) return held();
  if (message.type === 'INSPECT') {
    const key = `${lease.generation}:${message.requestId}`;
    if (pending.has(key)) {
      const job = pending.get(key);
      return job.tabId === sender.tab.id && job.documentId === sender.documentId
        ? job.promise
        : held();
    }
    const promise = inspect(message, sender, lease)
      .catch(held)
      .finally(() => pending.delete(key));
    pending.set(key, { tabId: sender.tab.id, documentId: sender.documentId, promise });
    return promise;
  }
  const { requests = {} } = await chrome.storage.session.get('requests');
  const registered = requests[message.requestId];
  if (
    !registered ||
    registered.tabId !== sender.tab.id ||
    registered.documentId !== sender.documentId ||
    registered.consumed
  )
    return held();
  const { body } = await controllerRequest('/api/controlled-click/status', lease, {
    method: 'POST',
    body: JSON.stringify({ requestId: message.requestId }),
  });
  if (
    body.requestId !== message.requestId ||
    !['CHECKING', 'COMPLETE', 'ERROR'].includes(body.state) ||
    (body.runId !== undefined && body.runId !== registered.result.runId) ||
    (body.state === 'COMPLETE' &&
      !['SUSPICIOUS', 'UNDETERMINED', 'INSPECTION_UNAVAILABLE'].includes(body.classification))
  )
    return held();
  return serialize(async () => {
    if (!(await sameLease(lease)) || !(await validSender(sender))) return held();
    if (message.type === 'RELEASE') {
      const { body: fresh } = await controllerRequest('/api/controlled-click/status', lease, {
        method: 'POST',
        body: JSON.stringify({ requestId: message.requestId }),
      });
      if (fresh.requestId !== message.requestId || fresh.runId !== registered.result.runId)
        return held();
      return releaseNavigation(fresh, message, sender, lease);
    }
    return {
      ok: body.state !== 'ERROR',
      state: body.state,
      requestId: message.requestId,
      runId: registered.result.runId,
      ...(body.state === 'COMPLETE'
        ? { classification: body.classification, decision: body.decision ?? 'REVIEW' }
        : {}),
      receiptUrl: `${config.controllerOrigin}/?run=${encodeURIComponent(registered.result.runId)}`,
    };
  });
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  handle(message, sender).then(respond, () => respond(held()));
  return true;
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === alarmName)
    void serialize(async () => {
      const { lease } = await chrome.storage.session.get('lease');
      if (lease && lease.expiresAt <= Date.now()) await revoke();
    });
});

// A policy grant can open only the build-time URL, once, in its original held tab.
// No allowAllRequests or domain-wide bypass is installed. A temporary main-frame
// guard blocks changed HTTP redirect destinations until commit/error/expiry.
async function releaseNavigation(body, message, sender, lease) {
  const expiresAt = Date.parse(body.release?.expiresAt ?? '');
  if (
    body.state !== 'COMPLETE' ||
    body.decision !== 'RELEASE' ||
    body.classification !== 'UNDETERMINED' ||
    body.execution !== 'SUCCEEDED' ||
    !['CONFIRMED', 'RETAINED'].includes(body.cleanup) ||
    body.release?.policy !== 'NO_FINDINGS_V1' ||
    body.release.url !== config.fixtureUrl ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now() ||
    expiresAt > Date.now() + 15000
  )
    return held();
  const { requests = {}, release } = await chrome.storage.session.get(null);
  const record = requests[message.requestId];
  if (
    release ||
    !record ||
    record.consumed ||
    record.tabId !== sender.tab.id ||
    record.documentId !== sender.documentId
  )
    return held();
  const target = config.fixtureUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const grant = {
    tabId: sender.tab.id,
    requestId: message.requestId,
    expiresAt: Math.min(expiresAt, lease.expiresAt),
  };
  // Persist consumed authority before opening any network gate, including on restart.
  await chrome.storage.session.set({
    requests: { ...requests, [message.requestId]: { ...record, consumed: true } },
    release: grant,
  });
  try {
    await chrome.alarms.create(releaseAlarm, { when: grant.expiresAt });
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [...releaseRuleIds, 7105],
      addRules: [
        {
          id: 7103,
          priority: 40,
          action: { type: 'allow' },
          condition: {
            regexFilter: '^' + target + '$',
            isUrlFilterCaseSensitive: true,
            tabIds: [sender.tab.id],
            resourceTypes: ['main_frame'],
            requestMethods: ['get'],
          },
        },
        {
          id: 7105,
          priority: 25,
          action: { type: 'allow' },
          condition: {
            regexFilter: config.rules[1].condition.regexFilter,
            isUrlFilterCaseSensitive: true,
            tabIds: [sender.tab.id],
            excludedResourceTypes: ['main_frame', 'sub_frame'],
          },
        },
        {
          id: 7104,
          priority: 30,
          action: { type: 'block' },
          condition: {
            tabIds: [sender.tab.id],
            resourceTypes: ['main_frame'],
          },
        },
      ],
    });
    if (!(await sameLease(lease)) || Date.now() >= grant.expiresAt || !(await validSender(sender)))
      throw new Error('Expired or changed context');
    await chrome.tabs.update(sender.tab.id, { url: config.fixtureUrl });
    return { ok: true, state: 'RELEASING', requestId: message.requestId };
  } catch {
    await clearRelease();
    return held();
  }
}

function finishRelease(details, committed = false) {
  if (details.frameId !== 0 || details.url !== config.fixtureUrl) return;
  void serialize(async () => {
    const { release } = await chrome.storage.session.get('release');
    if (release?.tabId === details.tabId)
      await clearRelease(committed && details.url === config.fixtureUrl);
  });
}
chrome.webNavigation.onCommitted.addListener((details) => finishRelease(details, true));
chrome.webNavigation.onErrorOccurred.addListener(finishRelease);
chrome.tabs.onRemoved.addListener((tabId) => {
  void serialize(async () => {
    const { release, assetTab } = await chrome.storage.session.get(null);
    if (release?.tabId === tabId || assetTab === tabId) await clearRelease();
  });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === releaseAlarm) void serialize(() => clearRelease());
});
// Never resume an interrupted navigation grant after a worker restart.
// Consumed authority stays consumed; retry requires a new inspection.
void serialize(async () => {
  const { release } = await chrome.storage.session.get('release');
  if (release) await clearRelease();
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  void serialize(async () => {
    const { release, assetTab } = await chrome.storage.session.get(null);
    if (!release && assetTab === details.tabId) {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [7105] });
      await chrome.storage.session.remove(['assetTab']);
    }
  });
});
