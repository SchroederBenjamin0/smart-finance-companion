import type { Subscription } from '@/db/types';
import { addMonths } from '@/lib/date';

/**
 * Returns subscriptions whose nextBillDate is on or before today and that
 * haven't already ended. The list is what should be shown to the user
 * for confirmation before auto-debiting.
 */
export function findDueSubscriptions(
  subs: Subscription[],
  now: Date = new Date(),
): Subscription[] {
  const todayIso = now.toISOString().slice(0, 10);
  return subs.filter((s) => {
    if (s.isActive !== 1) return false;
    if (s.endDate && s.endDate.slice(0, 10) < todayIso) return false;
    return s.nextBillDate.slice(0, 10) <= todayIso;
  });
}

/**
 * After the user confirms a debit, advance the subscription:
 *   - lastBilledDate = nextBillDate (the one we just paid)
 *   - nextBillDate = old nextBillDate + 1 cycle
 */
export function advanceCycle(sub: Subscription): Subscription {
  const months = sub.billingCycle === 'monthly' ? 1 : 12;
  const next = addMonths(sub.nextBillDate, months);
  return {
    ...sub,
    lastBilledDate: sub.nextBillDate,
    nextBillDate: next,
  };
}
