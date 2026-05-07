import { describe, it, expect } from 'vitest';
import { classify, shouldNotify } from '@/modules/income-detector';
import { DEFAULT_INCOME_THRESHOLDS } from '@/db/types';

describe('Income Detector — classify()', () => {
  const t = DEFAULT_INCOME_THRESHOLDS;

  it.each([
    [49.99, 'silent'],
    [50, 'standard'],
    [199, 'standard'],
    [199.99, 'standard'],
    [200, 'review'],
    [499, 'review'],
    [500, 'review'],
    [999, 'review'],
    [1000, 'special'],
    [1500, 'special'],
  ] as const)('amount %f → %s', (amount, expected) => {
    expect(classify(amount, 'main_job', t)).toBe(expected);
  });

  it('classification is independent of source for fixed amount', () => {
    expect(classify(100, 'main_job', t)).toBe(
      classify(100, 'dj_gig', t),
    );
    expect(classify(100, 'main_job', t)).toBe(
      classify(100, 'other', t),
    );
  });

  it('rejects negative amounts', () => {
    expect(() => classify(-5, 'main_job', t)).toThrow();
  });

  it('rejects NaN/Infinity', () => {
    expect(() => classify(NaN, 'main_job', t)).toThrow();
    expect(() => classify(Infinity, 'main_job', t)).toThrow();
  });

  it('shouldNotify only fires at the push threshold (500+)', () => {
    // Per architektur.md: push notifications fire for 500-999 € and 1000+.
    // 200-499 only triggers an in-app dialog.
    expect(shouldNotify(199, t)).toBe(false);
    expect(shouldNotify(200, t)).toBe(false);
    expect(shouldNotify(499, t)).toBe(false);
    expect(shouldNotify(500, t)).toBe(true);
    expect(shouldNotify(1000, t)).toBe(true);
  });
});
