import type { CaseSnapshot } from '../contracts/index.js';

const coverage = [
  [
    'CREDENTIAL_PHISHING',
    'Credential phishing',
    'Password fields on origins outside the configured trusted-login list.',
  ],
  [
    'CROSS_ORIGIN_CREDENTIAL_SUBMISSION',
    'External password forms',
    'Password forms targeting an unapproved external origin.',
  ],
  [
    'EXECUTABLE_DOWNLOAD_LURE',
    'Executable download lures',
    'Links and prompts encouraging executable downloads.',
  ],
  [
    'TECH_SUPPORT_SCAM',
    'Tech-support scams',
    'Urgent infected-device warnings paired with contact-support instructions.',
  ],
  [
    'CLICKFIX',
    'ClickFix command lures',
    'Instructions to paste commands or run a terminal to fix an issue.',
  ],
] as const;

type Props = {
  snapshot: CaseSnapshot;
  mode: string;
  busy: boolean;
  tab: 'workspace' | 'evidence' | 'ledger';
  imageUrl: string | null;
  consent: boolean;
  setConsent: (value: boolean) => void;
  create: () => void;
  command: (action: string) => void;
  exportReceipt: () => void;
};

export function DetectorPanel({
  snapshot,
  mode,
  busy,
  tab,
  imageUrl,
  consent,
  setConsent,
  create,
  command,
  exportReceipt,
}: Props) {
  const active = snapshot.execution === 'INSPECTING';
  const findings = snapshot.link.findings;
  const provider = snapshot.link.source === 'SOLARI_SANDBOX' ? 'Solari' : 'Vercel';
  const inspected = snapshot.link.execution === 'SUCCEEDED';
  const cleanupLabel = active
    ? 'pending inspection completion'
    : snapshot.link.cleanup.state.toLowerCase().replaceAll('_', ' ');
  const classification =
    snapshot.link.classification === 'UNDETERMINED'
      ? 'No warning signs detected'
      : snapshot.link.classification.replaceAll('_', ' ').toLowerCase();
  return (
    <>
      <section className="case-heading">
        <div>
          <span className="eyebrow">LINK INSPECTION</span>
          <h1>Inspection workspace</h1>
          <p>Check the destination. Review the findings. Keep the evidence.</p>
        </div>
        <div className="heading-actions">
          <button className="secondary" disabled={busy || active} onClick={create}>
            New inspection
          </button>
          <button className="secondary" onClick={exportReceipt}>
            Export receipt ↗
          </button>
        </div>
      </section>
      <section className="source-strip" aria-label="Inspection status">
        <span>
          {snapshot.modes.inspection} · {provider} inspection
        </span>
        <span>
          {snapshot.link.decision === 'RELEASE'
            ? 'no findings · browser release authorized'
            : snapshot.execution === 'BLOCKED'
              ? 'warning signs found · navigation blocked'
              : snapshot.execution.toLowerCase().replaceAll('_', ' ')}
        </span>
        <span>Cleanup: {cleanupLabel}</span>
        <span className="run-label">{snapshot.identity.runId.slice(0, 16)}…</span>
      </section>
      <details className="detector-boundary">
        <summary>About this inspection</summary>
        <p>
          Direct remote inspection of a registered URL. Safari is not required for this demo; this
          run does not prove Safari interception or browser protection. Heuristic coverage is
          limited to five patterns, not a claim about the five most prevalent attacks.
        </p>
      </details>
      {!snapshot.authorization ? (
        <section className="authorization">
          <div>
            <span className="eyebrow">BEFORE YOU BEGIN</span>
            <h2>Authorize this test page.</h2>
            <p>
              Authorize remote inspection of an owned test fixture. No credentials will be
              submitted, downloads opened, or page JavaScript executed.
            </p>
          </div>
          <div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>I authorize inspection of this owned fixture.</span>
            </label>
            <button
              className="primary"
              disabled={!consent || busy}
              onClick={() => command('authorize')}
            >
              Authorize inspection →
            </button>
          </div>
        </section>
      ) : null}
      {snapshot.authorization && snapshot.execution === 'READY' ? (
        <section className="ready-banner">
          <span className="pulse-dot" />
          <div>
            <strong>
              {mode === 'MOCK' ? 'Ready for a software check' : `Ready for ${provider} inspection`}
            </strong>
            <p>
              {mode === 'MOCK'
                ? 'Mock observations check software behavior only; they are not live detection evidence.'
                : 'Collect a bounded page observation, evaluate warning signs, and record sandbox cleanup.'}
            </p>
          </div>
          <button
            className="primary"
            disabled={busy}
            onClick={() => command(mode === 'MOCK' ? 'software-check' : 'inspect')}
          >
            {mode === 'MOCK' ? 'Run software check' : 'Inspect registered URL'} →
          </button>
        </section>
      ) : null}
      {tab === 'ledger' ? (
        <section className="data-section">
          <h2>Inspection ledger</h2>
          <ol className="event-list">
            {snapshot.events.map((event) => (
              <li key={event.sequence}>
                <span className="event-seq">{String(event.sequence).padStart(2, '0')}</span>
                <div>
                  <strong>{event.type.toLowerCase().replaceAll('_', ' ')}</strong>
                  <p>
                    {[event.payload.actionId, event.payload.reason].filter(Boolean).join(' · ') ||
                      `Revision ${event.revision}`}
                  </p>
                </div>
                <time>{new Date(event.at).toLocaleTimeString()}</time>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <>
          <section className="inspection-panel detector-inspection">
            <div className="section-title">
              <h2>Inspection result</h2>
              <span className="block-label">
                {snapshot.modes.inspection === 'MOCK' ? 'MOCK' : 'REMOTE'}
              </span>
            </div>
            <div className="inspection-content">
              {imageUrl && snapshot.modes.inspection === 'LIVE' ? (
                <img src={imageUrl} alt="Inert screenshot returned by the remote inspector" />
              ) : (
                <div className="image-placeholder">
                  <span>⊘</span>
                  <small>
                    {snapshot.modes.inspection === 'MOCK'
                      ? 'Software check · no remote screenshot'
                      : active
                        ? 'Inspection in progress'
                        : 'No remote screenshot available'}
                  </small>
                </div>
              )}
              <div>
                <strong className="detector-verdict" role="status">
                  {active
                    ? 'Inspecting the page…'
                    : snapshot.link.execution === 'PENDING'
                      ? 'Awaiting inspection'
                      : classification}
                </strong>
                <p>
                  {snapshot.link.observation?.title ||
                    (snapshot.link.execution === 'UNAVAILABLE'
                      ? 'The inspector could not return usable evidence. No safety conclusion is available.'
                      : 'The inspection will report visible warning signs from the registered fixture.')}
                </p>
                {snapshot.link.observation ? (
                  <p className="detector-url">
                    Observed URL: <code>{snapshot.link.observation.finalUrl}</code>
                  </p>
                ) : null}
                <p>
                  {findings.length} warning {findings.length === 1 ? 'sign' : 'signs'} recorded.
                </p>
                {snapshot.link.failure ? (
                  <p>
                    Inspection failure: {snapshot.link.failure.toLowerCase().replaceAll('_', ' ')}
                  </p>
                ) : null}
                <span className="cleanup">Cleanup: {cleanupLabel}</span>
                <p className="subtle">
                  A warning sign is not proof of compromise. No matches does not establish safety.
                </p>
              </div>
            </div>
          </section>
          <section className="data-section detector-findings">
            <h2>Warning signs</h2>
            {findings.length ? (
              findings.map((finding) => (
                <article className="detector-finding" key={`${finding.category}-${finding.ruleId}`}>
                  <span className="rule">
                    {finding.ruleId} ·{' '}
                    {coverage.find(([id]) => id === finding.category)?.[1] ?? finding.category}
                  </span>
                  <h3>{finding.summary}</h3>
                  <ul>
                    {finding.evidence.map((evidence, index) => (
                      <li key={index}>{evidence}</li>
                    ))}
                  </ul>
                  <p className="subtle">Limit: {finding.limitation}</p>
                </article>
              ))
            ) : (
              <p className="empty-note">
                {inspected
                  ? 'No configured rule matched the collected observation. Other threats, hidden behavior, and unobserved content remain outside this result.'
                  : 'No findings yet. Run an inspection to collect evidence.'}
              </p>
            )}
            {tab === 'evidence' && snapshot.link.observation ? (
              <div className="detector-observation">
                <h3>Collected page text</h3>
                <pre>{snapshot.link.observation.text}</pre>
              </div>
            ) : null}
          </section>
          <details className="data-section coverage-details" open={tab === 'evidence' || undefined}>
            <summary>
              Detector coverage <span>5 checks</span>
            </summary>
            <p className="subtle">Bounded heuristics for an owned-fixture demonstration.</p>
            <div className="detector-coverage">
              {coverage.map(([id, label, description]) => (
                <article key={id}>
                  <span className="eyebrow">
                    {findings.some((finding) => finding.category === id)
                      ? 'WARNING SIGN FOUND'
                      : inspected
                        ? 'NO MATCH · NOT A SAFETY VERDICT'
                        : 'AWAITING INSPECTION'}
                  </span>
                  <h3>{label}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </details>
        </>
      )}
      <footer className="workspace-footer">
        <span>
          <i className={active ? 'pulse-dot' : 'status-dot'} />
          {active ? 'Remote inspection in progress' : 'Evidence retained in the inspection receipt'}
        </span>
        <span className="subtle">No automatic remediation or incident-response claims.</span>
      </footer>
    </>
  );
}
