import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import {
  ASSUMPTIONS,
  CaseSnapshotSchema,
  WarmPoolStatusSchema,
  type WarmPoolStatus,
  type CaseSnapshot,
} from '../contracts/index.js';
import { request, caseRequest, exportReceipt, exportClickTimings } from './api.js';
import { ClickTiming, type ClickTimingRecord } from './interaction-timing.js';
import { EvidenceGraph } from './EvidenceGraph.js';
import { ComparisonStrip } from './ComparisonStrip.js';
import { ProtectionControls } from './ProtectionControls.js';
import { DetectorPanel } from './DetectorPanel.js';

export function App() {
  const pendingClickTiming = useRef<ClickTiming | null>(null);
  const [clickTimings, setClickTimings] = useState<ClickTimingRecord[]>([]);
  const [requestedRun] = useState(() => {
    const value = new URLSearchParams(location.search).get('run');
    return value && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : null;
  });
  const [showOperatorControls, setShowOperatorControls] = useState(false);
  const [token, setToken] = useState(() => sessionStorage.getItem('aionguard.controller') ?? '');
  const [connected, setConnected] = useState(false);
  const [sandbox, setSandbox] = useState<WarmPoolStatus | null>(null);
  const [sandboxUnavailable, setSandboxUnavailable] = useState(false);
  const [preparingSandbox, setPreparingSandbox] = useState(false);
  const [mode, setMode] = useState('LIVE');
  const [workflow, setWorkflow] = useState<'DETECTOR' | 'SYNTHETIC'>('DETECTOR');
  const [snapshot, setSnapshot] = useState<CaseSnapshot | null>(null);
  const [selected, setSelected] = useState('HYP-002');
  const [tab, setTab] = useState<'workspace' | 'evidence' | 'ledger'>('workspace');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const runId = snapshot?.identity.runId;
  const imagePath = snapshot?.link.imagePath;
  const detector = (snapshot?.workflow ?? workflow) === 'DETECTOR';

  useLayoutEffect(() => {
    if (!snapshot || !pendingClickTiming.current) return;
    // This runs after React commits the result DOM; it does not prove physical paint or image load.
    const record = pendingClickTiming.current.commit(snapshot);
    if (record) {
      pendingClickTiming.current = null;
      setClickTimings((records) => [...records.slice(-99), record]);
    }
  }, [snapshot]);

  useEffect(() => {
    void fetch('/api/health')
      .then((r) => r.json())
      .then((h) => {
        setMode(h.mode);
        setWorkflow(h.workflow === 'SYNTHETIC' ? 'SYNTHETIC' : 'DETECTOR');
      })
      .catch(() => setError('The local controller is unavailable.'));
  }, []);
  useEffect(() => {
    if (!connected || !runId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await caseRequest(`/api/attempts/${runId}`, token);
        if (!stopped) setSnapshot(next);
      } catch (e) {
        if (!stopped) setError(message(e));
      }
      if (!stopped) timer = setTimeout(() => void poll(), 1000);
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [connected, runId, token]);
  useEffect(() => {
    if (!connected || !detector) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const status = WarmPoolStatusSchema.parse(await request('/api/sandbox', token));
        if (!stopped) {
          setSandbox(status);
          setSandboxUnavailable(false);
        }
      } catch {
        if (!stopped) {
          setSandbox(null);
          setSandboxUnavailable(true);
        }
      }
      if (!stopped) timer = setTimeout(() => void poll(), 1500);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [connected, detector, token]);
  useEffect(() => {
    setImageUrl(null);
    if (!imagePath || !connected) return;
    let stopped = false;
    let url: string | null = null;
    void fetch(imagePath, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.blob();
      })
      .then((blob) => {
        if (!stopped) {
          url = URL.createObjectURL(blob);
          setImageUrl(url);
        }
      })
      .catch(() => {});
    return () => {
      stopped = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [imagePath, connected, token]);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function connect(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      const value = await request('/api/attempts', token);
      const cases = CaseSnapshotSchema.array().parse(value);
      setSnapshot(cases.find((c) => c.identity.runId === requestedRun) ?? cases.at(-1) ?? null);
      sessionStorage.setItem('aionguard.controller', token);
      setConnected(true);
    });
  }
  async function create() {
    await act(async () => {
      setSnapshot(await caseRequest('/api/attempts', token, {}));
      setConsent(false);
    });
  }
  async function command(action: string) {
    if (!snapshot) return;
    const current = snapshot;
    const requestId = crypto.randomUUID();
    const timing =
      current.workflow === 'DETECTOR' && ['inspect', 'software-check'].includes(action)
        ? new ClickTiming(
            current.identity.runId,
            requestId,
            current.modes.inspection,
            current.link.source,
          )
        : null;
    if (timing) pendingClickTiming.current = timing;
    await act(async () => {
      const body =
        action === 'authorize'
          ? current.workflow === 'DETECTOR'
            ? { scenario: 'OWNED_FIXTURE_INSPECTION', assumptions: [], change: 'NONE' }
            : {
                scenario: 'SYNTHETIC_ASSUMED_COMPROMISE',
                assumptions: ASSUMPTIONS,
                change: 'jenkins.cli_enabled:true->false',
              }
          : { requestId, revision: current.identity.revision };
      timing?.dispatch();
      try {
        const next = await caseRequest(
          `/api/attempts/${current.identity.runId}/${action}`,
          token,
          body,
        );
        timing?.responseParsed(next);
        setSnapshot(next);
      } catch (e) {
        const record = timing?.fail();
        if (record) {
          pendingClickTiming.current = null;
          setClickTimings((records) => [...records.slice(-99), record]);
        }
        throw e;
      }
    });
  }
  async function prepareSandbox() {
    if (preparingSandbox || sandbox?.state !== 'EMPTY') return;
    setPreparingSandbox(true);
    try {
      setSandbox(WarmPoolStatusSchema.parse(await request('/api/sandbox/prepare', token, {})));
      setSandboxUnavailable(false);
    } catch (e) {
      setSandbox(null);
      setSandboxUnavailable(true);
      setError(message(e));
    } finally {
      setPreparingSandbox(false);
    }
  }
  const assessment = snapshot?.assessments.find((h) => h.hypothesisId === selected);
  const baseline = snapshot?.baseline?.assessments.find((h) => h.hypothesisId === selected);
  const active = snapshot
    ? ['INSPECTING', 'INVESTIGATING', 'VERIFYING'].includes(snapshot.execution)
    : false;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Case navigation">
        <a className="brand" href="/" aria-label="AionGuard home">
          <span className="brand-mark">A</span>
          <span>
            AionGuard
            <small>{detector ? 'INSPECT BEFORE EXPOSURE' : 'INVESTIGATION WORKSPACE'}</small>
          </span>
        </a>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Workspace">
          {(['workspace', 'evidence', 'ledger'] as const).map((name, i) => (
            <button
              key={name}
              className={tab === name ? 'nav-item current' : 'nav-item'}
              onClick={() => setTab(name)}
            >
              <span aria-hidden="true">{['◈', '≡', '↳'][i]}</span>
              {name === 'workspace'
                ? detector
                  ? 'Inspections'
                  : 'Investigation'
                : name === 'evidence'
                  ? detector
                    ? 'Evidence'
                    : 'Evidence library'
                  : 'Action ledger'}
              {name === 'workspace' ? <i aria-hidden="true">01</i> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          <span>
            Local controller
            <small>{connected ? 'Connected · private session' : 'Operator access required'}</small>
          </span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <span>/</span> <strong>{detector ? 'Inspections' : 'PR-014'}</strong>
          </div>
          <div className="topbar-right">
            <span className={`mode-label ${mode === 'MOCK' ? 'mock' : ''}`}>
              {mode === 'MOCK' ? 'MOCK PREVIEW' : 'LIVE CONTROLLER'}
            </span>
            <span className="workspace-access">Private workspace</span>
          </div>
        </header>
        {connected && !detector ? (
          <ProtectionControls
            token={token}
            runId={runId}
            canArm={snapshot?.execution === 'READY' && !!snapshot.authorization}
          />
        ) : null}
        {connected && detector && sandbox?.state !== 'DISABLED' ? (
          <section className="ready-banner" aria-label="Solari sandbox readiness">
            <div role="status" aria-live="polite">
              <strong>
                {sandboxUnavailable
                  ? 'Sandbox status unavailable'
                  : sandbox
                    ? sandboxLabels[sandbox.state]
                    : 'Checking sandbox readiness…'}
              </strong>
              <p>
                {sandboxUnavailable
                  ? 'The controller could not confirm readiness. Reconnecting automatically.'
                  : sandbox
                    ? sandboxDescriptions[sandbox.state]
                    : 'Waiting for the controller’s current status.'}
              </p>
              {sandbox?.state === 'READY' ? (
                <p className="subtle">
                  {sandbox.inspectionCount} inspections in this sandbox.
                  {sandbox.expiresAt
                    ? ` Maximum lifetime ends at ${new Date(sandbox.expiresAt).toLocaleTimeString()}; idle retirement may happen sooner.`
                    : ''}
                </p>
              ) : null}
              {sandbox && !sandboxUnavailable ? (
                <p className="subtle">
                  Each inspection opens a fresh browser. Retaining the sandbox does not mean a link
                  is safe or authorize navigation.
                </p>
              ) : null}
            </div>
            {sandbox?.state === 'EMPTY' && !sandboxUnavailable ? (
              <button
                className="secondary"
                disabled={preparingSandbox}
                onClick={() => void prepareSandbox()}
              >
                {preparingSandbox ? 'Preparing…' : 'Prepare sandbox'}
              </button>
            ) : null}
          </section>
        ) : null}
        {connected && detector && clickTimings.length > 0 ? (
          <details className="timing-details" aria-label="Click to result timing">
            <summary>
              Inspection timing{' '}
              <span>
                {clickTimings.at(-1)?.mode} ·{' '}
                {clickTimings.at(-1)?.durationsMs.clickToResultCommit != null
                  ? `${(clickTimings.at(-1)!.durationsMs.clickToResultCommit! / 1000).toFixed(3)} s`
                  : 'Request failed'}
              </span>
            </summary>
            <div>
              <strong>Click to result</strong>
              <p>
                {clickTimings.at(-1)?.durationsMs.clickToResultCommit != null
                  ? `${(clickTimings.at(-1)!.durationsMs.clickToResultCommit! / 1000).toFixed(3)} s from Inspect to result in this workspace.`
                  : 'The last inspection request failed; no completed result timing.'}
              </p>
              <p className="subtle">
                {clickTimings.at(-1)?.mode} · Direct operator click · Astra not invoked. This does
                not measure an intercepted browser link or screenshot loading.
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="secondary"
                onClick={() => exportClickTimings(clickTimings, 'json')}
              >
                Timing JSON ↓
              </button>
              <button className="secondary" onClick={() => exportClickTimings(clickTimings, 'csv')}>
                Timing CSV ↓
              </button>
            </div>
          </details>
        ) : null}
        {error ? (
          <div className="error-banner" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError('')}>
              ×
            </button>
          </div>
        ) : null}
        {!connected && requestedRun && !showOperatorControls ? (
          <section className="connect-screen">
            <span className="eyebrow">AIONGUARD LINK HANDOFF</span>
            <h1>Link inspection handoff</h1>
            <p>Open operator controls to check this case’s inspection and protection status.</p>
            <button className="primary" onClick={() => setShowOperatorControls(true)}>
              Open operator controls <span>→</span>
            </button>
            <p className="subtle">
              Focusing the operator token field can enable Secure Input and release temporary link
              protection so keyboard recovery remains available.
            </p>
          </section>
        ) : !connected ? (
          <div className="connect-layout">
            <section className="connect-screen">
              <span className="eyebrow">LOCAL WORKSPACE</span>
              <h1>
                Connect your
                <br />
                inspection workspace.
              </h1>
              <p>Review a link, follow its inspection, and see the evidence in one place.</p>
              <form onSubmit={connect}>
                <label htmlFor="token">Controller access token</label>
                <input
                  id="token"
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                  minLength={32}
                  placeholder="Enter your local access token"
                  aria-describedby="token-help"
                />
                <button className="primary" disabled={busy || token.length < 32}>
                  {busy ? 'Connecting…' : 'Open workspace'} <span>→</span>
                </button>
                <p id="token-help" className="subtle">
                  Find your token in <code>runtime-data/controller-token</code>. It stays in this
                  tab session.
                </p>
              </form>
            </section>
            <aside className="connection-aside" aria-label="Inspection workflow">
              <div className="connection-art" aria-hidden="true">
                <svg viewBox="0 0 360 240" fill="none">
                  <rect
                    x="71"
                    y="25"
                    width="236"
                    height="162"
                    rx="14"
                    fill="var(--surface)"
                    stroke="var(--line)"
                    strokeWidth="2"
                  />
                  <path d="M72 62H306" stroke="var(--line)" />
                  <circle cx="91" cy="44" r="4" fill="var(--accent)" />
                  <circle cx="106" cy="44" r="4" fill="var(--line)" />
                  <circle cx="121" cy="44" r="4" fill="var(--line)" />
                  <rect x="96" y="85" width="131" height="9" rx="4" fill="var(--line)" />
                  <rect x="96" y="106" width="179" height="7" rx="3" fill="var(--line)" />
                  <rect x="96" y="125" width="150" height="7" rx="3" fill="var(--line)" />
                  <rect x="38" y="158" width="27" height="63" rx="5" fill="var(--text)" />
                  <rect x="295" y="158" width="27" height="63" rx="5" fill="var(--text)" />
                  <rect x="50" y="155" width="258" height="19" rx="5" fill="var(--accent)" />
                  <path
                    d="M98 156L84 173M144 156L130 173M190 156L176 173M236 156L222 173M282 156L268 173"
                    stroke="var(--surface)"
                    strokeWidth="7"
                  />
                  <path d="M22 223H338" stroke="var(--line)" strokeWidth="2" />
                </svg>
              </div>
              <span className="eyebrow">THE INSPECTION FLOW</span>
              <ol className="connection-steps">
                <li>
                  <span>01</span>
                  <div>
                    <strong>Hold the link</strong>
                    <p>Keep navigation paused.</p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>Inspect remotely</strong>
                    <p>Collect the page in a separate sandbox.</p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>Review the evidence</strong>
                    <p>See the findings before deciding what comes next.</p>
                  </div>
                </li>
              </ol>
              <p className="subtle">This workspace controls registered test inspections.</p>
            </aside>
          </div>
        ) : !snapshot ? (
          <section className="connect-screen">
            <span className="eyebrow">
              {detector ? 'AIONGUARD / LINK DETECTOR' : 'PR-014 / ACME'}
            </span>
            <h1>{detector ? 'Your next inspection starts here.' : 'Start with a clean case.'}</h1>
            <p>
              {detector
                ? 'Create a case for your registered test page. Findings, screenshots, and the inspection history will appear here.'
                : 'A new attempt receives its own evidence ledger and four credits. Existing attempts retain their history.'}
            </p>
            <button className="primary" disabled={busy} onClick={() => void create()}>
              {detector ? 'Create inspection' : 'Create investigation'} <span>+</span>
            </button>
            <p className="subtle">
              {detector
                ? 'Direct remote inspection works without Safari. It does not demonstrate browser interception.'
                : 'Authorize the case before arming temporary registered-link protection.'}
            </p>
          </section>
        ) : detector ? (
          <DetectorPanel
            snapshot={snapshot}
            mode={mode}
            busy={busy}
            tab={tab}
            imageUrl={imageUrl}
            consent={consent}
            setConsent={setConsent}
            create={() => void create()}
            command={(action) => void command(action)}
            exportReceipt={() => void act(() => exportReceipt(snapshot.identity.runId, token))}
          />
        ) : (
          <>
            <section className="case-heading">
              <div>
                <span className="eyebrow">
                  PR-014 <span className="slash">/</span> EXPOSURE INVESTIGATION
                </span>
                <h1>Exposure investigation</h1>
                <p>
                  Apprentice-07 <span>·</span> Synthetic Acme environment <span>·</span> Revision{' '}
                  {snapshot.identity.revision}
                </p>
              </div>
              <div className="heading-actions">
                <button
                  className="secondary"
                  disabled={busy || active}
                  onClick={() => void create()}
                >
                  New attempt
                </button>
                <button
                  className="secondary"
                  onClick={() => void act(() => exportReceipt(snapshot.identity.runId, token))}
                >
                  Export receipt ↗
                </button>
              </div>
            </section>
            <section className="source-strip" aria-label="Evidence sources">
              <span>
                <i className="status-dot" />
                {snapshot.link.execution === 'PENDING'
                  ? 'Inspection not run'
                  : snapshot.link.execution === 'UNAVAILABLE'
                    ? 'Inspection unavailable'
                    : `${snapshot.modes.inspection} Vercel`}
              </span>
              <span>
                {snapshot.execution === 'MODEL_UNAVAILABLE'
                  ? 'Astra unavailable'
                  : snapshot.events.some((e) => e.type === 'PLANNER_DECIDED')
                    ? `${snapshot.modes.planner} Astra transport`
                    : snapshot.execution === 'INVESTIGATING'
                      ? 'Astra request pending'
                      : 'Astra not dispatched'}
              </span>
              <span>Synthetic organization</span>
              <span className="run-label">{snapshot.identity.runId.slice(0, 16)}…</span>
            </section>
            {!snapshot.authorization ? (
              <section className="authorization">
                <div>
                  <span className="eyebrow">SCENARIO AUTHORIZATION</span>
                  <h2>Set the investigation boundary.</h2>
                  <p>
                    Assume this synthetic account's credentials were compromised. Permit bounded
                    read checks and the exact synthetic change{' '}
                    <code>jenkins.cli_enabled: true → false</code>.
                  </p>
                  <p className="subtle">
                    Scope assumptions: fresh authentication is required, disabled status is
                    enforced, and no surviving session or alternate credential applies.
                  </p>
                </div>
                <div>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    <span>I authorize this synthetic scenario and change.</span>
                  </label>
                  <button
                    className="primary"
                    disabled={!consent || busy}
                    onClick={() => void command('authorize')}
                  >
                    Authorize case →
                  </button>
                </div>
              </section>
            ) : null}
            {snapshot.authorization && snapshot.execution === 'READY' ? (
              <section className="ready-banner">
                <span className="pulse-dot" />
                <div>
                  <strong>
                    {mode === 'MOCK'
                      ? 'Ready for software verification'
                      : 'Ready for a protected link'}
                  </strong>
                  <p>
                    {mode === 'MOCK'
                      ? 'Both providers are explicitly mocked. This checks application behavior only.'
                      : 'The configured extension can hand off the registered fixture. Check recovery readiness, website permission, and the protection lease before clicking.'}
                  </p>
                </div>
                {mode === 'MOCK' ? (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void command('software-check')}
                  >
                    Run software check →
                  </button>
                ) : null}
              </section>
            ) : null}
            {tab === 'workspace' ? (
              <>
                <div className="workspace-columns">
                  <div className="workspace-main">
                    <EvidenceGraph snapshot={snapshot} selected={selected} onSelect={setSelected} />
                    <section className="inspection-panel">
                      <div className="section-title">
                        <h2>Link inspection</h2>
                        <span className="block-label">BLOCK</span>
                      </div>
                      <div className="inspection-content">
                        {imageUrl && snapshot.modes.inspection === 'LIVE' ? (
                          <img
                            src={imageUrl}
                            alt="Inert PNG returned by the configured inspector"
                          />
                        ) : (
                          <div className="image-placeholder">
                            <span>⊘</span>
                            <small>
                              {snapshot.link.execution === 'PENDING'
                                ? 'No destination loaded here'
                                : snapshot.modes.inspection === 'MOCK'
                                  ? 'MOCK image transport · no remote frame'
                                  : 'Inspection image unavailable'}
                            </small>
                          </div>
                        )}
                        <div>
                          <strong>{snapshot.link.classification.replaceAll('_', ' ')}</strong>
                          <p>
                            {snapshot.link.execution === 'UNAVAILABLE'
                              ? 'Inspection unavailable. The link remains blocked; no suspicious finding was invented.'
                              : snapshot.link.observation?.title ||
                                'The destination will be inspected in a fresh remote environment.'}
                          </p>
                          {snapshot.link.ruleIds.map((rule) => (
                            <span className="rule" key={rule}>
                              {rule} ·{' '}
                              {rule === 'AUTH-01'
                                ? 'Credential-entry surface'
                                : 'Unapproved declared authentication destination'}
                            </span>
                          ))}
                          <p className="subtle">
                            No credentials submitted. Compromise not observed.
                          </p>
                          <span className="cleanup">
                            Cleanup:{' '}
                            {snapshot.link.cleanup.state.toLowerCase().replaceAll('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </section>
                  </div>
                  <aside className="inspector" aria-label="Selected path details">
                    <span className="eyebrow">PATH DETAILS</span>
                    <div className="detail-title">
                      <h2>{selected === 'HYP-001' ? 'Legacy Production' : 'Jenkins exposure'}</h2>
                      <span>{assessment?.impact ?? '—'}</span>
                    </div>
                    <div className={`detail-outcome ${(assessment?.outcome ?? '').toLowerCase()}`}>
                      {assessment?.outcome ?? 'INCONCLUSIVE'}
                    </div>
                    <p className="subtle">
                      {assessment?.depth != null
                        ? `Supported depth E${assessment.depth} of E4. Consequence is not validated.`
                        : 'Evidence is evaluated within the recorded authentication assumptions.'}
                    </p>
                    {baseline ? (
                      <div className="baseline">
                        <span className="eyebrow">
                          PRESERVED BASELINE / REVISION {snapshot.baseline?.revision}
                        </span>
                        <strong>
                          {baseline.impact} · {baseline.outcome}
                          {baseline.depth != null ? ` · E${baseline.depth}` : ''}
                        </strong>
                      </div>
                    ) : null}
                    <h3>Evidence gaps</h3>
                    <ul className="gaps">
                      {assessment?.gaps.length ? (
                        assessment.gaps.map((g) => <li key={g}>{g}</li>)
                      ) : (
                        <li>No unresolved condition in this modeled assessment.</li>
                      )}
                    </ul>
                    <h3>Rule references</h3>
                    <div className="rule-list">
                      {assessment?.ruleIds.map((rule) => (
                        <code key={rule}>{rule}</code>
                      ))}
                    </div>
                    <div className="verification">
                      <span className="eyebrow">DEFENSIVE CHANGE</span>
                      <p>Disable the synthetic Jenkins CLI, then buy a fresh availability check.</p>
                      {!snapshot.change ? (
                        <button
                          className="secondary full"
                          disabled={
                            busy ||
                            active ||
                            !snapshot.authorization ||
                            snapshot.link.classification !== 'SUSPICIOUS'
                          }
                          onClick={() => void command('harden')}
                        >
                          Apply authorized change
                        </button>
                      ) : snapshot.verification === 'REQUIRED' ? (
                        <button
                          className="primary full"
                          disabled={busy}
                          onClick={() => void command('verify')}
                        >
                          Verify fresh state · 1 credit
                        </button>
                      ) : (
                        <strong className={snapshot.verification === 'VERIFIED' ? 'mint' : ''}>
                          {snapshot.verification === 'VERIFIED'
                            ? 'Modeled condition verified'
                            : snapshot.verification === 'GAP'
                              ? 'Verification gap remains'
                              : 'Verification running…'}
                        </strong>
                      )}
                      <small>A configuration write is not evidence of its effect.</small>
                    </div>
                  </aside>
                </div>
                <section className="metrics-row">
                  <div>
                    <span>Directly reachable</span>
                    <strong>
                      {snapshot.access.reachable}
                      <small>/ 7</small>
                    </strong>
                  </div>
                  <div>
                    <span>Directly blocked</span>
                    <strong>{snapshot.access.blocked}</strong>
                  </div>
                  <div>
                    <span>Evidence credits</span>
                    <strong>
                      {snapshot.budget.remaining}
                      <small>/ 4 remaining</small>
                    </strong>
                  </div>
                  <div>
                    <span>Unresolved hypotheses</span>
                    <strong>{snapshot.summary.inconclusive}</strong>
                  </div>
                </section>
                <ComparisonStrip
                  token={token}
                  runId={snapshot.identity.runId}
                  classification={snapshot.link.classification}
                />
              </>
            ) : tab === 'evidence' ? (
              <section className="data-section">
                <h2>
                  Recorded observations{' '}
                  <span className="subtle">{snapshot.observations.length}</span>
                </h2>
                <p className="subtle">
                  Only collected facts appear here. Old revisions stay recorded; current assessments
                  enforce validity.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Predicate</th>
                        <th>Observed value</th>
                        <th>Revision</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.observations.map((o) => (
                        <tr key={o.id}>
                          <td>{o.subject}</td>
                          <td>{o.predicate.replaceAll('_', ' ')}</td>
                          <td>
                            <code>{JSON.stringify(o.value)}</code>
                          </td>
                          <td>
                            {o.revision}
                            {o.validity.carriedFrom ? ' · carried' : ''}
                          </td>
                          <td>
                            {o.source.kind.toLowerCase().replaceAll('_', ' ')}
                            <small>{new Date(o.observedAt).toLocaleTimeString()}</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!snapshot.observations.length ? (
                  <p className="empty-note">
                    The investigation has not collected organization evidence.
                  </p>
                ) : null}
              </section>
            ) : (
              <section className="data-section">
                <div className="section-title">
                  <h2>Action ledger</h2>
                  <strong>{snapshot.budget.spent} / 4 credits spent</strong>
                </div>
                <ol className="event-list">
                  {snapshot.events.map((e) => (
                    <li key={e.sequence}>
                      <span className="event-seq">{String(e.sequence).padStart(2, '0')}</span>
                      <div>
                        <strong>{e.type.toLowerCase().replaceAll('_', ' ')}</strong>
                        <p>
                          {[e.payload.actionId, e.payload.reason].filter(Boolean).join(' · ') ||
                            `Revision ${e.revision}`}
                        </p>
                      </div>
                      <time>{new Date(e.at).toLocaleTimeString()}</time>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            <footer className="workspace-footer">
              <span>
                <i className={active ? 'pulse-dot' : 'status-dot'} />
                {snapshot.execution.toLowerCase().replaceAll('_', ' ')}
              </span>
              {['PAUSED', 'MODEL_UNAVAILABLE', 'STOPPED'].includes(snapshot.execution) &&
              !snapshot.change ? (
                <button
                  className="text-button"
                  disabled={busy || snapshot.budget.remaining === 0}
                  onClick={() => void command('continue')}
                >
                  Continue investigation →
                </button>
              ) : (
                <span className="subtle">Evidence decides. Consequences remain unproven.</span>
              )}
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

const sandboxLabels: Record<WarmPoolStatus['state'], string> = {
  DISABLED: 'Warm sandbox disabled',
  EMPTY: 'No warm sandbox available',
  PREPARING: 'Preparing Solari sandbox…',
  READY: 'Solari sandbox ready',
  INSPECTING: 'Sandbox inspection in progress',
  RETIRING: 'Retiring Solari sandbox…',
  BLOCKED: 'Sandbox preparation blocked',
  CLOSED: 'Sandbox controller closed',
};
const sandboxDescriptions: Record<WarmPoolStatus['state'], string> = {
  DISABLED: 'This configuration does not use a warm sandbox.',
  EMPTY: 'Prepare a sandbox before inspecting so browser setup finishes ahead of the request.',
  PREPARING: 'Preparing the browser environment before it can accept an inspection.',
  READY: 'The prepared environment can accept one inspection at a time.',
  INSPECTING: 'The sandbox is reserved for the current inspection.',
  RETIRING: 'This sandbox cannot accept another inspection while retirement is in progress.',
  BLOCKED: 'Resource cleanup is unresolved. Reconcile it before preparing another sandbox.',
  CLOSED: 'The controller is shutting down and cannot accept inspections.',
};
