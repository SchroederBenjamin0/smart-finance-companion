import type { AllocationRule } from '@/db/types';
import { round2 } from '@/lib/currency';

export interface AllocationResult {
  fun: number;
  savings: number;
  investment: number;
  capApplied: boolean;
}

export function split(
  amount: number,
  rule: AllocationRule,
  currentSavingsBalance: number,
): AllocationResult {
  validateRule(rule);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }

  const fun = round2((amount * rule.funPercentage) / 100);
  let savings = round2((amount * rule.savingsPercentage) / 100);
  let investment = round2(amount - fun - savings);

  let capApplied = false;
  if (rule.savingsCap !== null) {
    const newSavings = currentSavingsBalance + savings;
    if (newSavings > rule.savingsCap) {
      const overflow = round2(newSavings - rule.savingsCap);
      savings = round2(savings - overflow);
      if (savings < 0) {
        // current already exceeds cap; nothing should go to savings
        investment = round2(investment + savings + overflow);
        savings = 0;
      } else {
        investment = round2(investment + overflow);
      }
      capApplied = true;
    }
  }

  return {
    fun,
    savings,
    investment,
    capApplied,
  };
}

function validateRule(rule: AllocationRule): void {
  const sum =
    rule.funPercentage + rule.savingsPercentage + rule.investmentPercentage;
  if (Math.abs(sum - 100) > 0.001) {
    throw new Error(
      `AllocationRule percentages must sum to 100, got ${sum}`,
    );
  }
  for (const v of [
    rule.funPercentage,
    rule.savingsPercentage,
    rule.investmentPercentage,
  ]) {
    if (v < 0 || v > 100) throw new Error(`Invalid percentage: ${v}`);
  }
  if (rule.savingsCap !== null && rule.savingsCap < 0) {
    throw new Error(`Invalid savingsCap: ${rule.savingsCap}`);
  }
}
