import type {
  IncomeClassification,
  IncomeSource,
  IncomeThresholds,
} from '@/db/types';

export function classify(
  amount: number,
  _source: IncomeSource,
  thresholds: IncomeThresholds,
): IncomeClassification {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  if (amount < thresholds.silent) return 'silent';
  if (amount < thresholds.standard) return 'standard';
  if (amount < thresholds.review) return 'review';
  if (amount < thresholds.special) return 'review';
  return 'special';
}

/**
 * Returns true if a Push notification should fire for this income event.
 * Sprint 4 wires this into the actual Notification API; Sprint 1 keeps
 * the predicate so callers can pre-flag UI banners.
 */
export function shouldNotify(
  amount: number,
  thresholds: IncomeThresholds,
): boolean {
  return amount >= thresholds.review;
}
