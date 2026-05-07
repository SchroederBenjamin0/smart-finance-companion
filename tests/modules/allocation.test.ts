import { describe, it, expect } from 'vitest';
import { split } from '@/modules/allocation';
import type { AllocationRule } from '@/db/types';

const main: AllocationRule = {
  funPercentage: 30,
  savingsPercentage: 25,
  investmentPercentage: 45,
  savingsCap: 3300,
};

const dj: AllocationRule = {
  funPercentage: 20,
  savingsPercentage: 20,
  investmentPercentage: 60,
  savingsCap: 3300,
};

describe('Allocation Engine — split()', () => {
  it('splits 100€ at 30/25/45 to 30/25/45 with no cap applied', () => {
    const r = split(100, main, 0);
    expect(r.fun).toBe(30);
    expect(r.savings).toBe(25);
    expect(r.investment).toBe(45);
    expect(r.capApplied).toBe(false);
    expect(roundTotal(r)).toBeCloseTo(100, 2);
  });

  it('cap-logic: savings=3200, +200 with cap 3300 → +100 to savings, overflow to investment', () => {
    // 200€ at DJ rule (20/20/60): savings=40, investment=120
    // currentSavings=3200, newSavings=3240 → still under cap
    // Use a rule that pushes savings closer to cap
    const r = split(800, dj, 3200);
    // savings would be 160, but cap allows only +100 → overflow 60 → investment += 60
    expect(r.savings).toBe(100);
    expect(r.investment).toBe(60 + 480); // 480 is the original 60% of 800
    expect(r.capApplied).toBe(true);
    expect(roundTotal(r)).toBeCloseTo(800, 2);
  });

  it('cap-logic: savings already at cap (3300), +100 → 0 to savings, +100 to investment', () => {
    // Use main rule with 100€: would split 30/25/45
    // current=3300, savingsCap=3300 → savings overflow is full 25
    const r = split(100, main, 3300);
    expect(r.savings).toBe(0);
    expect(r.fun).toBe(30);
    expect(r.investment).toBe(70);
    expect(r.capApplied).toBe(true);
    expect(roundTotal(r)).toBeCloseTo(100, 2);
  });

  it('rounding: 33.33€ at 30/30/40 keeps total exact (no drift)', () => {
    const evenRule: AllocationRule = {
      funPercentage: 30,
      savingsPercentage: 30,
      investmentPercentage: 40,
      savingsCap: null,
    };
    const r = split(33.33, evenRule, 0);
    // Sum must equal input within rounding tolerance
    expect(roundTotal(r)).toBeCloseTo(33.33, 2);
  });

  it('rejects rules whose percentages do not sum to 100', () => {
    const bad: AllocationRule = {
      funPercentage: 30,
      savingsPercentage: 30,
      investmentPercentage: 30,
      savingsCap: null,
    };
    expect(() => split(100, bad, 0)).toThrow();
  });

  it('rejects negative amounts', () => {
    expect(() => split(-1, main, 0)).toThrow();
  });

  it('handles zero amount cleanly', () => {
    const r = split(0, main, 0);
    expect(r.fun).toBe(0);
    expect(r.savings).toBe(0);
    expect(r.investment).toBe(0);
    expect(r.capApplied).toBe(false);
  });

  it('null cap means no cap applied even at huge balance', () => {
    const noCapRule: AllocationRule = { ...main, savingsCap: null };
    const r = split(100, noCapRule, 999_999);
    expect(r.savings).toBe(25);
    expect(r.capApplied).toBe(false);
  });
});

function roundTotal(r: {
  fun: number;
  savings: number;
  investment: number;
}): number {
  return Math.round((r.fun + r.savings + r.investment) * 100) / 100;
}
