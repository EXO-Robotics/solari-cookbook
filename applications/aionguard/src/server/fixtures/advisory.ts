/** A pinned defensive record, not live vulnerability discovery or exploit validation. */
export const JENKINS_ADVISORY = Object.freeze({
  id: 'CVE-2024-23897' as const,
  source: 'https://www.jenkins.io/security/advisory/2024-01-24/',
  publishedAt: '2024-01-24',
  verifiedAt: '2026-09-10',
  weeklyAffectedThrough: '2.441',
  ltsAffectedThrough: '2.426.2',
  weeklyFixed: '2.442',
  ltsFixed: ['2.426.3', '2.440.1'],
  workaround: 'Effective CLI access disabled; a short-term workaround, not a patch.',
  consequenceValidated: false,
});

export type AdvisoryApplicability = 'AFFECTED' | 'NOT_AFFECTED' | 'UNKNOWN';

/** Jenkins uses two-component weekly and three-component LTS version numbers. */
export function jenkinsApplicability(version: string): AdvisoryApplicability {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/.test(version)) return 'UNKNOWN';
  const parts = version.split('.').map(Number);
  const major = parts[0]!;
  const minor = parts[1]!;
  if (major < 1 || !parts.every(Number.isSafeInteger)) return 'UNKNOWN';
  if (major < 2) return 'AFFECTED';
  if (major > 2) return 'NOT_AFFECTED';
  if (parts.length === 2) return minor <= 441 ? 'AFFECTED' : 'NOT_AFFECTED';
  if (minor < 426) return 'AFFECTED';
  if (minor > 426) return 'NOT_AFFECTED';
  return parts[2]! <= 2 ? 'AFFECTED' : 'NOT_AFFECTED';
}
