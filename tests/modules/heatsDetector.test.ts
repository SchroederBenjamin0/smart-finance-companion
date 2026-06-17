import { describe, it, expect } from 'vitest';
import { isHeatsAmount } from '@/modules/categorizer/heatsDetector';

describe('isHeatsAmount', () => {
  it('matches exact -7.80', () => {
    expect(isHeatsAmount(-7.8)).toBe(true);
  });

  it('matches exact -15.60', () => {
    expect(isHeatsAmount(-15.6)).toBe(true);
  });

  it('matches positive 7.80 (sign-agnostic)', () => {
    expect(isHeatsAmount(7.8)).toBe(true);
  });

  it('tolerates ±0.001 floating-point noise', () => {
    expect(isHeatsAmount(-7.800001)).toBe(true);
    expect(isHeatsAmount(-15.599999)).toBe(true);
  });

  it('rejects close-but-not-matching amounts', () => {
    expect(isHeatsAmount(-7.79)).toBe(false);
    expect(isHeatsAmount(-7.81)).toBe(false);
    expect(isHeatsAmount(-15.5)).toBe(false);
    expect(isHeatsAmount(-15.7)).toBe(false);
  });

  it('rejects unrelated amounts', () => {
    expect(isHeatsAmount(-3.5)).toBe(false);
    expect(isHeatsAmount(-100)).toBe(false);
    expect(isHeatsAmount(0)).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(isHeatsAmount(Number.NaN)).toBe(false);
    expect(isHeatsAmount(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
