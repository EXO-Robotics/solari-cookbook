/** Five bounded demo heuristics, not a prevalence ranking or a malware verdict. */
export const THREAT_CATEGORIES = [
  'CREDENTIAL_PHISHING',
  'CROSS_ORIGIN_CREDENTIAL_SUBMISSION',
  'EXECUTABLE_DOWNLOAD_LURE',
  'TECH_SUPPORT_SCAM',
  'CLICKFIX',
] as const;
export type ThreatCategory = (typeof THREAT_CATEGORIES)[number];
export interface ThreatObservation {
  finalUrl: string;
  title: string;
  text: string;
  passwordField: boolean;
  formAction: string | null;
  formDestinationOrigin: string | null;
  downloadLinks?: readonly { href: string; text: string }[];
}
export interface ThreatFinding {
  category: ThreatCategory;
  ruleId: string;
  summary: string;
  evidence: string[];
  limitation: string;
}
export const DETECTION_LIMITS =
  'Heuristics inspect a static page title, the first 1000 body characters, one password form, and up to 20 links from the first 200 anchors. Page scripts are disabled. Findings can be false positives; no findings means unknown, never safe. No payload execution, malware scanning, iframe coverage, or prevalence ranking is claimed.';

function originOf(value: string | null, base?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return ['https:', 'http:'].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}
function excerpt(text: string, expression: RegExp): string | null {
  const match = expression.exec(text);
  return match
    ? text.slice(Math.max(0, match.index - 35), match.index + match[0].length + 65)
    : null;
}

/** An empty array is absence of heuristic findings, NOT a safe verdict. */
export function detectThreats(
  observation: ThreatObservation,
  approvedIdpOrigins: readonly string[],
): ThreatFinding[] {
  const findings: ThreatFinding[] = [];
  const pageOrigin = originOf(observation.finalUrl);
  const approved = new Set(approvedIdpOrigins.map((value) => originOf(value)).filter(Boolean));
  const add = (
    category: ThreatCategory,
    ruleId: string,
    summary: string,
    evidence: string[],
    limitation: string,
  ) => findings.push({ category, ruleId, summary, evidence, limitation });
  if (observation.passwordField && pageOrigin && !approved.has(pageOrigin)) {
    add(
      'CREDENTIAL_PHISHING',
      'AG-PHISH-001',
      'Password entry on an unapproved origin',
      [
        `Password field observed on ${pageOrigin}`,
        'Page origin is absent from the configured identity-provider allowlist.',
      ],
      'An unlisted legitimate login also triggers this policy heuristic; brand impersonation is not proven.',
    );
  }
  // Require an actual parsed form action. Never invent a destination from page text.
  const destination = originOf(observation.formAction, observation.finalUrl);
  if (
    observation.passwordField &&
    pageOrigin &&
    destination &&
    destination !== pageOrigin &&
    !approved.has(destination)
  ) {
    add(
      'CROSS_ORIGIN_CREDENTIAL_SUBMISSION',
      'AG-FORM-001',
      'Password form targets an unapproved external origin',
      [`Page origin: ${pageOrigin}`, `Declared password form destination: ${destination}`],
      'A declared form action is not proof that credentials were submitted or exfiltrated; legitimate external authentication can match.',
    );
  }
  const text = `${observation.title.slice(0, 200)} ${observation.text.slice(0, 1000)}`;
  for (const link of (observation.downloadLinks ?? []).slice(0, 20)) {
    try {
      const url = new URL(link.href.slice(0, 2048), observation.finalUrl);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        !/\.(?:exe|msi|scr|bat|cmd|ps1|vbs|js|dmg|pkg|apk)$/i.test(url.pathname)
      )
        continue;
      const lure = excerpt(
        `${link.text.slice(0, 200)} ${text}`,
        /\b(?:required|urgent|critical|security update|update (?:your )?(?:browser|player)|(?:install|download) (?:the )?(?:update|codec)|verify (?:your )?identity)\b/i,
      );
      if (!lure) continue;
      add(
        'EXECUTABLE_DOWNLOAD_LURE',
        'AG-DOWNLOAD-001',
        'Executable download paired with an update or urgency lure',
        [`Executable link: ${url.origin}${url.pathname}`.slice(0, 500), `Lure text: ${lure}`],
        'File extensions and language are only indicators; the file is not downloaded or scanned and legitimate installers can match.',
      );
      break;
    } catch {
      /* Malformed links do not provide evidence. */
    }
  }
  const urgency = excerpt(
    text,
    /\b(?:immediately|urgent|do not (?:close|restart|shut down)|act now)\b/i,
  );
  const contact = excerpt(
    text,
    /\b(?:call|contact)\b.{0,60}\b(?:support|technician|helpline|\+?\d[\d ()-]{5,}\d)\b/i,
  );
  const alarm = excerpt(
    text,
    /\b(?:computer|device|system|pc)\b.{0,50}\b(?:infected|locked|blocked|compromised)\b/i,
  );
  if (urgency && contact && alarm) {
    add(
      'TECH_SUPPORT_SCAM',
      'AG-SUPPORT-001',
      'Urgent device alarm directs the visitor to support',
      [urgency, contact, alarm],
      'Static language may also appear in legitimate support or educational material; phone ownership is not checked.',
    );
  }
  const pretext = excerpt(
    text,
    /\b(?:verify (?:that )?you(?: are|'re) (?:human|not a robot)|verification|captcha|fix (?:the |this )?(?:error|problem))\b/i,
  );
  const instruction = excerpt(
    text,
    /\b(?:paste|run|execute|copy)\b.{0,100}\b(?:command|powershell|terminal|cmd|win(?:dows)?\s*\+\s*r|script)\b/i,
  );
  if (pretext && instruction) {
    add(
      'CLICKFIX',
      'AG-CLICKFIX-001',
      'Verification or repair asks the visitor to run an operating-system command',
      [pretext, instruction],
      'Instruction text is only a ClickFix-like signal; security tutorials can match and no command is executed.',
    );
  }
  return findings;
}
