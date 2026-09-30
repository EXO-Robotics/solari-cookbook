import type { Assessment, CaseSnapshot } from '../contracts/index.js';
function label(h?: Assessment): string {
  return h ? h.outcome.toLowerCase() : 'awaiting evidence';
}
export function EvidenceGraph({
  snapshot,
  selected,
  onSelect,
}: {
  snapshot: CaseSnapshot;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const legacy = snapshot.assessments.find((a) => a.hypothesisId === 'HYP-001');
  const jenkins = snapshot.assessments.find((a) => a.hypothesisId === 'HYP-002');
  const identityKnown = snapshot.observations.some(
    (o) => o.predicate === 'runtime_identity' && o.validity.current,
  );
  const productionBlocked = snapshot.observations.some(
    (o) =>
      o.subject === 'Production' &&
      o.predicate === 'direct_access' &&
      o.value === 'BLOCKED' &&
      o.revision === snapshot.identity.revision &&
      o.validity.current,
  );
  return (
    <section className="graph" aria-label="Two modeled exposure paths">
      <div className="graph-heading">
        <span className="eyebrow">EXPOSURE MAP</span>
        <span className="subtle">Evidence depth ≤ E4</span>
      </div>
      <div className="graph-grid">
        <div className="principal-node">
          <span className="node-symbol">A7</span>
          <strong>Apprentice-07</strong>
          <span>Assumed compromise</span>
        </div>
        <div className="paths">
          <button
            className={`path-node ${selected === 'HYP-001' ? 'selected' : ''}`}
            onClick={() => onSelect('HYP-001')}
            aria-pressed={selected === 'HYP-001'}
          >
            <span className="node-top">
              <span>01 / LEGACY PRODUCTION</span>
              <span className="impact">CRITICAL</span>
            </span>
            <strong>Legacy credential reference</strong>
            <span className="node-detail">Production authentication path</span>
            <span className={`outcome ${(legacy?.outcome ?? '').toLowerCase()}`}>
              <i />
              {label(legacy)}
            </span>
          </button>
          <button
            className={`path-node ${selected === 'HYP-002' ? 'selected' : ''}`}
            onClick={() => onSelect('HYP-002')}
            aria-pressed={selected === 'HYP-002'}
          >
            <span className="node-top">
              <span>02 / JENKINS-02</span>
              <span className="impact">HIGH</span>
            </span>
            <strong>CLI-dependent exposure</strong>
            <span className="node-detail">CVE-2024-23897 · potential relevance</span>
            <span className={`outcome ${(jenkins?.outcome ?? '').toLowerCase()}`}>
              <i />
              {label(jenkins)}
              {jenkins?.depth != null ? ` · E${jenkins.depth}` : ''}
            </span>
          </button>
        </div>
        <div className="destinations">
          <div>
            <span className="destination-icon">↗</span>
            <strong>Production</strong>
            <span>
              {productionBlocked ? 'Direct access blocked' : 'Direct access not assessed'}
            </span>
          </div>
          <div className="gap-node">
            <span className="gap-label">CONSEQUENCE GAP</span>
            <strong>{identityKnown ? 'ci-service → Staging' : 'Runtime identity → Staging'}</strong>
            <span>Context only · no takeover demonstrated</span>
          </div>
        </div>
      </div>
      <div className="graph-footer">
        <span>
          <i className="solid-line" />
          Modeled relationship
        </span>
        <span>
          <i className="dashed-line" />
          Unvalidated consequence
        </span>
        <span className="subtle">Synthetic organization</span>
      </div>
    </section>
  );
}
