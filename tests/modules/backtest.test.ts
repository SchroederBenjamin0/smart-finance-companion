import { describe, it, expect } from 'vitest';
import { simulateDCA, computeMaxDrawdown } from '@/modules/backtest';

describe('simulateDCA', () => {
  it('produces value series tracking closes', () => {
    const closes = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-02-01', close: 110 },
      { date: '2024-03-01', close: 100 },
    ];
    const r = simulateDCA(closes, 100);
    expect(r.length).toBe(3);
    expect(r[0]!.value).toBeCloseTo(100, 1);
  });

  it('cumulates shares across monthly purchases', () => {
    const closes = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-02-01', close: 100 },
      { date: '2024-03-01', close: 200 },
    ];
    const r = simulateDCA(closes, 100);
    // Month 1: buy 1 share at 100 → value 100
    // Month 2: buy 1 share at 100 → 2 shares → value 200
    // Month 3: buy 0.5 share at 200 → 2.5 shares → value 500
    expect(r[2]!.value).toBeCloseTo(500, 1);
  });
});

describe('computeMaxDrawdown', () => {
  it('returns 0 for monotonically increasing series', () => {
    const series = [
      { date: '2024-01', value: 100 },
      { date: '2024-02', value: 110 },
      { date: '2024-03', value: 120 },
    ];
    expect(computeMaxDrawdown(series)).toBe(0);
  });

  it('returns max peak-to-trough drop as positive ratio', () => {
    const series = [
      { date: '2024-01', value: 100 },
      { date: '2024-02', value: 200 },
      { date: '2024-03', value: 100 },
      { date: '2024-04', value: 150 },
    ];
    expect(computeMaxDrawdown(series)).toBeCloseTo(0.5, 2);
  });
});
