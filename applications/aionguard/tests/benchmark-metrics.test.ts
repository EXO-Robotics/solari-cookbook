import { describe, expect, it } from 'vitest';
import {
  csvCell,
  interval,
  percentile,
  runsCsv,
  summarize,
  type BenchmarkRun,
} from '../scripts/benchmark-metrics.ts';

describe('benchmark reporting', () => {
  it('uses nearest-rank and excludes missing measurements rather than zero-filling failures', () => {
    expect(percentile([10, 40, null, 20, 30], 0.5)).toBe(20);
    expect(
      percentile(
        Array.from({ length: 100 }, (_, i) => i + 1),
        0.95,
      ),
    ).toBe(95);
    expect(percentile([null, NaN], 0.9)).toBeNull();
    expect(() => percentile([1], 0)).toThrow();
  });
  it('keeps failure and missing-sample denominators visible', () => {
    const base: BenchmarkRun = {
      run: 1,
      expectedCategory: 'NONE',
      classification: 'UNDETERMINED',
      categories: [],
      expectedCategoryMatched: true,
      execution: 'SUCCEEDED',
      cleanup: 'CONFIRMED',
      error: null,
      timestamps: {},
      durationsMs: { backendDecision: 120 },
      astraInvoked: false,
      astraStatus: 'NOT_INVOKED',
    };
    const failed: BenchmarkRun = {
      ...base,
      run: 2,
      classification: 'INSPECTION_UNAVAILABLE',
      execution: 'UNAVAILABLE',
      expectedCategoryMatched: null,
      cleanup: 'UNRESOLVED',
      durationsMs: { backendDecision: null },
    };
    const summary = summarize([base, failed], 50);
    expect(summary).toMatchObject({
      attempted: 2,
      notAttempted: 48,
      succeeded: 1,
      unavailable: 1,
      cleanupUnresolved: 1,
      expectedCategoryNotEvaluable: 1,
    });
    expect(summary.latency.backendDecision).toEqual({
      measured: 1,
      missing: 1,
      medianMs: 120,
      p90Ms: 120,
      p95Ms: 120,
    });
    const incomplete = summarize([base, failed], 50, 1);
    expect(incomplete).toMatchObject({
      attempted: 3,
      completed: 2,
      incomplete: 1,
      notAttempted: 47,
    });
    expect(incomplete.latency.backendDecision?.missing).toBe(2);
    expect(incomplete.successfulLatency.backendDecision?.measured).toBe(1);
    const unsafe = summarize([{ ...base, cleanup: 'UNRESOLVED' }], 1);
    expect(unsafe.succeeded).toBe(0);
    expect(unsafe.successfulLatency.backendDecision?.medianMs).toBeNull();
    expect(runsCsv([failed])).toContain('false,NOT_INVOKED,,,,\n');
  });
  it('requires both ordered timestamps and escapes CSV quotes, commas and newlines', () => {
    expect(interval({ a: { iso: '', elapsedMs: 10 } }, 'a', 'b')).toBeNull();
    expect(
      interval({ a: { iso: '', elapsedMs: 10 }, b: { iso: '', elapsedMs: 9 } }, 'a', 'b'),
    ).toBeNull();
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell(null)).toBe('');
  });
});
