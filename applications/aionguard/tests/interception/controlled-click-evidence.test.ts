import { describe, expect, it } from 'vitest';
import {
  summarizeNetLog,
  validateControlledComparison,
} from '../../scripts/controlled-click-evidence.ts';

const target = 'https://fixture.example/owned/';
const canary = 'http://127.0.0.1:4342';
const constants = {
  logEventTypes: {
    URL_REQUEST_START_JOB: 1,
    HTTP_TRANSACTION_SEND_REQUEST_HEADERS: 2,
    HTTP_TRANSACTION_HTTP2_SEND_REQUEST_HEADERS: 3,
    HTTP_TRANSACTION_QUIC_SEND_REQUEST_HEADERS: 4,
  },
};
const start = (id: number, url: string) => ({ type: 1, source: { id }, params: { url } });
const send = (id: number, type = 2) => ({
  type,
  source: { id },
  params: { headers: ['Authorization: NEVER_EXPORT'], line: 'GET /' },
});
const log = (...events: object[]) => ({
  constants,
  events: [start(1, canary), send(1), ...events],
});

describe('independent controlled-click network evidence', () => {
  it('does not mistake an attempted URL and extension redirect for a sent request', () => {
    const result = summarizeNetLog(
      log(
        start(2, target),
        start(2, 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/hold.html'),
      ),
      target,
      canary,
    );
    expect(result.destinationRequestsSent).toBe(0);
    expect(result.canaryRequestsSent).toBe(1);
  });
  it('attributes redirect-chain sends to the URL current at each send', () => {
    const result = summarizeNetLog(
      log(start(2, target), send(2), start(2, 'https://elsewhere.example/'), send(2)),
      target,
      canary,
    );
    expect(result.destinationDocumentRequestsSent).toBe(1);
    expect(result.totalRequestsSent).toBe(3);
    expect(JSON.stringify(result)).not.toContain('Authorization');
    expect(JSON.stringify(result)).not.toContain('NEVER_EXPORT');
  });
  it('counts every HTTP protocol and all destination-origin paths', () => {
    const result = summarizeNetLog(
      log(
        start(2, target),
        send(2, 2),
        start(3, target + 'asset?secret=never'),
        send(3, 3),
        start(4, target),
        send(4, 4),
      ),
      target,
      canary,
    );
    expect(result.destinationRequestsSent).toBe(3);
    expect(result.destinationDocumentRequestsSent).toBe(2);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('requires known capture vocabulary and an actual local-page canary send', () => {
    expect(() =>
      summarizeNetLog({ constants, events: [start(2, target)] }, target, canary),
    ).toThrow('NETLOG_CANARY_ABSENT');
    expect(() =>
      summarizeNetLog({ constants: { logEventTypes: {} }, events: [] }, target, canary),
    ).toThrow('NETLOG_EVENT_TYPES');
  });
  it('fails closed when send events cannot be attributed', () => {
    expect(() => summarizeNetLog(log(send(91)), target, canary)).toThrow(
      'NETLOG_UNATTRIBUTED_SEND',
    );
  });
  it('requires a positive baseline and zero protected sends to the same destination', () => {
    const baseline = summarizeNetLog(log(start(2, target), send(2)), target, canary);
    const protectedRun = summarizeNetLog(log(start(2, target)), target, canary);
    expect(validateControlledComparison(baseline, protectedRun)).toBe(true);
    expect(() => validateControlledComparison(protectedRun, protectedRun)).toThrow(
      'BASELINE_DID_NOT_SEND',
    );
    expect(() => validateControlledComparison(baseline, baseline)).toThrow(
      'PROTECTED_DESTINATION_REQUEST_SENT',
    );
  });
});
