import type { LinkAssessment } from '../../contracts/index.js';

export interface ReleasePolicy {
  readonly url: string;
}
export const RELEASE_EVIDENCE_TTL_MS = 15_000;

/** A policy grant is not a safe verdict and does not prove navigation occurred. */
export function applyReleasePolicy(
  link: LinkAssessment,
  policy: ReleasePolicy | undefined,
  trigger: string,
  now = Date.now(),
): LinkAssessment {
  const { release: _priorRelease, ...current } = link;
  if (link.classification === 'SUSPICIOUS' || link.findings.length)
    return { ...current, decision: 'BLOCK' };
  const review: LinkAssessment = { ...current, decision: 'REVIEW' };
  const observation = link.observation;
  if (
    !policy ||
    trigger !== 'CHROME_HANDOFF' ||
    link.mode !== 'LIVE' ||
    link.execution !== 'SUCCEEDED' ||
    link.classification !== 'UNDETERMINED' ||
    link.failure !== null ||
    !link.imagePath ||
    !observation ||
    !['CONFIRMED', 'RETAINED'].includes(link.cleanup.state) ||
    observation.finalUrl !== policy.url ||
    observation.redirects.some((url) => url !== policy.url)
  )
    return review;
  const observedAt = Date.parse(observation.observedAt);
  const returnedAt = Date.parse(link.timing.returnedAt ?? '');
  const collectedAt = Date.parse(link.timing.collectionStartedAt ?? '');
  const heldAt = Date.parse(link.timing.heldAt);
  if (
    ![observedAt, returnedAt, collectedAt, heldAt, now].every(Number.isFinite) ||
    heldAt > collectedAt ||
    collectedAt > observedAt ||
    observedAt > returnedAt ||
    returnedAt > now ||
    now - observedAt >= RELEASE_EVIDENCE_TTL_MS
  )
    return review;
  return {
    ...current,
    decision: 'RELEASE',
    release: {
      url: policy.url,
      expiresAt: new Date(observedAt + RELEASE_EVIDENCE_TTL_MS).toISOString(),
      policy: 'NO_FINDINGS_V1',
    },
  };
}
