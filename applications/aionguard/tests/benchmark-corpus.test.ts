import { describe, expect, it } from 'vitest';
import { createCorpus, templates } from '../fixtures/benchmark/corpus.ts';
import { summarize } from '../scripts/benchmark-corpus.ts';

describe('controlled corpus', () => {
  it('fixes independent scenario labels and transparent correlated variant counts', () => {
    const corpus = createCorpus();
    expect(corpus).toEqual(createCorpus());
    expect(templates).toHaveLength(30);
    expect(corpus).toHaveLength(150);
    expect(new Set(corpus.map((c) => c.id)).size).toBe(150);
    expect(corpus.filter((c) => c.group === 'benign')).toHaveLength(50);
    for (const group of ['credential', 'brand-mismatch', 'redirect', 'download', 'mixed'])
      expect(corpus.filter((c) => c.group === group)).toHaveLength(20);
    expect(corpus.filter((c) => c.expected === 'AMBIGUOUS')).toHaveLength(10);
    expect(corpus.every((c) => !/<script/i.test(c.html))).toBe(true);
  });
  it('excludes ambiguous and failed extraction cases without treating errors as negatives', () => {
    const summary = summarize([
      { expected: 'MALICIOUS', categories: ['CREDENTIAL_PHISHING'], error: null },
      { expected: 'MALICIOUS', categories: [], error: null },
      { expected: 'BENIGN', categories: ['CLICKFIX'], error: null },
      { expected: 'BENIGN', categories: [], error: null },
      { expected: 'AMBIGUOUS', categories: ['CLICKFIX'], error: null },
      { expected: 'MALICIOUS', categories: [], error: 'CASE_EXTRACTION_FAILED' },
    ]);
    expect(summary).toMatchObject({
      allByExpected: { MALICIOUS: 3, BENIGN: 2, AMBIGUOUS: 1 },
      errorsByExpected: { MALICIOUS: 1, BENIGN: 0, AMBIGUOUS: 0 },
      conservativeMaliciousDetectionYield: 1 / 3,
      tp: 1,
      fn: 1,
      fp: 1,
      tn: 1,
      ambiguous: 1,
      errors: 1,
      evaluatedBinary: 4,
      tpr: 0.5,
      fpr: 0.5,
      precision: 0.5,
    });
  });
  it('reports undefined rates as null instead of a misleading zero', () => {
    expect(summarize([])).toMatchObject({ tpr: null, fpr: null, precision: null });
  });
});
