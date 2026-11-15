import { describe, expect, it } from 'vitest';
import { wilsonInterval, percentile } from '../../src/evals/stats.js';

describe('wilsonInterval', () => {
  it('returns [0, 0] for 0 total', () => {
    expect(wilsonInterval(0, 0)).toEqual([0, 0]);
  });

  it('returns narrow bounds for large samples with high success', () => {
    const [lo, hi] = wilsonInterval(95, 100);
    expect(lo).toBeGreaterThan(0.88);
    expect(hi).toBeLessThan(0.99);
  });

  it('returns wide bounds for small samples', () => {
    const [lo, hi] = wilsonInterval(3, 5);
    expect(hi - lo).toBeGreaterThan(0.2);
  });

  it('handles 100% success', () => {
    const [lo, hi] = wilsonInterval(10, 10);
    expect(lo).toBeGreaterThan(0.5);
    expect(hi).toBeLessThanOrEqual(1);
  });

  it('handles 0% success', () => {
    const [lo, hi] = wilsonInterval(0, 10);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThan(0.4);
  });
});

describe('percentile', () => {
  it('returns 0 for an empty sample', () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  it('returns the median for an odd-length sample', () => {
    expect(percentile([10, 20, 30], 0.5)).toBe(20);
  });

  it('returns the p95 nearest-rank value', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 0.95)).toBe(95);
  });

  it('does not mutate the input array', () => {
    const values = [30, 10, 20];
    percentile(values, 0.5);
    expect(values).toEqual([30, 10, 20]);
  });
});
