import { describe, it, expect } from 'vitest';
import { computeMaxDrawdown } from '@/modules/backtest';

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
