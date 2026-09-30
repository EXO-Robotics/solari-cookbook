import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  detectThreats,
  DETECTION_LIMITS,
  type ThreatObservation,
} from '../src/server/detection/index.js';
import { pageFacts } from '../src/server/isolation/worker.mjs';

const baseline: ThreatObservation = {
  finalUrl: 'https://shop.example/sign-in',
  title: 'Welcome',
  text: 'Welcome to our shop.',
  passwordField: false,
  formAction: null,
  formDestinationOrigin: null,
};
const categories = (changes: Partial<ThreatObservation>, approved = ['https://id.example']) =>
  detectThreats({ ...baseline, ...changes }, approved).map((finding) => finding.category);

describe('five bounded web-threat heuristics', () => {
  it('flags unapproved password pages and accepts an exact approved origin', () => {
    expect(categories({ passwordField: true })).toContain('CREDENTIAL_PHISHING');
    expect(categories({ passwordField: true, finalUrl: 'https://id.example/login' })).not.toContain(
      'CREDENTIAL_PHISHING',
    );
    expect(
      categories({ passwordField: true, finalUrl: 'https://id.example.evil.test/login' }),
    ).toContain('CREDENTIAL_PHISHING');
    expect(categories({ text: 'Password recovery help' })).toEqual([]);
  });
  it('flags external password form destinations, with same-origin and trusted IdP negatives', () => {
    expect(
      categories({ passwordField: true, formAction: 'https://collector.example/submit' }),
    ).toContain('CROSS_ORIGIN_CREDENTIAL_SUBMISSION');
    for (const formAction of ['/submit', 'https://id.example/login', 'https://[', null]) {
      expect(categories({ passwordField: true, formAction })).not.toContain(
        'CROSS_ORIGIN_CREDENTIAL_SUBMISSION',
      );
    }
    expect(categories({ formAction: 'https://newsletter.example/join' })).not.toContain(
      'CROSS_ORIGIN_CREDENTIAL_SUBMISSION',
    );
  });
  it('requires an executable link plus a lure, without downloading anything', () => {
    expect(
      categories({
        text: 'A critical security update is required.',
        downloadLinks: [{ href: '/update.EXE?x=1', text: 'Download' }],
      }),
    ).toContain('EXECUTABLE_DOWNLOAD_LURE');
    expect(
      categories({
        downloadLinks: [{ href: '/installer.exe', text: 'Optional developer installer' }],
      }),
    ).toEqual([]);
    expect(
      categories({
        text: 'Urgent security update',
        downloadLinks: [{ href: '/notice.pdf', text: 'Read notice' }],
      }),
    ).toEqual([]);
    expect(
      categories({
        text: 'Required',
        downloadLinks: [{ href: 'javascript:evil.exe', text: 'Download' }],
      }),
    ).toEqual([]);
  });
  it('requires urgency, contact instructions, and a device alarm for support scams', () => {
    const text = 'Your computer is infected. Do not close this page. Call support immediately.';
    expect(categories({ text })).toContain('TECH_SUPPORT_SCAM');
    for (const text of [
      'Your computer is infected. Scan with your security software.',
      'Call support immediately for help with your order.',
      'Your device is locked. Contact support during business hours.',
    ]) {
      expect(categories({ text })).not.toContain('TECH_SUPPORT_SCAM');
    }
  });
  it('requires verification or repair plus an instruction to run an OS command for ClickFix', () => {
    expect(
      categories({ text: 'Verify you are human. Paste this command in PowerShell.' }),
    ).toContain('CLICKFIX');
    expect(categories({ text: 'To fix this error, run the command in your terminal.' })).toContain(
      'CLICKFIX',
    );
    expect(categories({ text: 'Complete the CAPTCHA to verify you are human.' })).not.toContain(
      'CLICKFIX',
    );
    expect(
      categories({ text: 'Run this command in your terminal to compile the project.' }),
    ).not.toContain('CLICKFIX');
  });
  it('reports evidence and limitations, while no findings is never a safe verdict', () => {
    const findings = detectThreats({ ...baseline, passwordField: true }, []);
    expect(findings[0]).toMatchObject({ ruleId: 'AG-PHISH-001', category: 'CREDENTIAL_PHISHING' });
    expect(findings[0]?.evidence.length).toBeGreaterThan(0);
    expect(findings[0]?.limitation).toContain('legitimate');
    expect(detectThreats(baseline, [])).toEqual([]);
    expect(DETECTION_LIMITS).toContain('never safe');
  });
  it('does not infer findings from text or links beyond the documented bounds', () => {
    expect(
      categories({
        text: 'x'.repeat(1000) + ' Verify you are human. Paste this command in PowerShell.',
      }),
    ).toEqual([]);
    expect(
      categories({
        text: 'Critical update required',
        downloadLinks: [
          ...Array.from({ length: 20 }, () => ({ href: '/readme.txt', text: 'readme' })),
          { href: '/update.exe', text: 'download' },
        ],
      }),
    ).toEqual([]);
  });
  it('extracts bounded resolved link declarations without invoking page actions', () => {
    const anchors = Array.from({ length: 25 }, () => ({
      getAttribute: () => '/update.exe',
      innerText: 'x'.repeat(300),
    }));
    const facts = runInNewContext(`(${pageFacts.toString()})()`, {
      URL,
      document: {
        title: 'Updates',
        body: { innerText: 'Required update' },
        baseURI: 'https://shop.example/nested/',
        querySelector: () => null,
        querySelectorAll: (selector: string) => (selector === 'a[href]' ? anchors : []),
      },
      location: { href: 'https://shop.example/nested/' },
    });
    expect(facts.downloadLinks).toHaveLength(20);
    expect(facts.downloadLinks[0].href).toBe('https://shop.example/update.exe');
    expect(facts.downloadLinks[0].text).toHaveLength(200);
  });
});
