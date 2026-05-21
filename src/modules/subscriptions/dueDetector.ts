import type { Subscription } from '@/db/types';
import { addMonths, todayIso } from '@/lib/date';

/**
 * Returns subscriptions whose nextBillDate is on or before today and that
 * haven't already ended. The list is what should be shown to the user
 * for confirmation before auto-debiting.
 */
export function findDueSubscriptions(
  subs: Subscription[],
  now: Date = new Date(),
): Subscription[] {
  const today = now.toISOString().slice(0, 10);
  return subs.filter((s) => {
    if (s.isActive !== 1) return false;
    if (s.endDate && s.endDate.slice(0, 10) < today) return false;
    return s.nextBillDate.slice(0, 10) <= today;
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

/**
 * Records that the subscription was debited on a specific date (typically
 * today). Updates both lastBilledDate and nextBillDate accordingly. Used
 * by the inline "Heute abgebucht" button so the user can keep the exact
 * rhythm of their charges in sync with what their bank actually does.
 */
export function markBilledOn(sub: Subscription, isoDate: string): Subscription {
  const months = sub.billingCycle === 'monthly' ? 1 : 12;
  const day = isoDate.slice(0, 10);
  return {
    ...sub,
    lastBilledDate: day,
    nextBillDate: addMonths(day, months),
  };
}

/**
 * Auto-rolls a subscription forward if its nextBillDate is strictly in the
 * past. We assume the charge happened on schedule (lastBilledDate becomes
 * the previous nextBillDate). Today is not auto-rolled — the user still
 * gets a chance to confirm same-day timing via the inline button.
 *
 * Safe to call repeatedly; returns the same object reference when no roll
 * is needed so callers can detect unchanged subs cheaply.
 */
export function rollForwardOverdue(
  sub: Subscription,
  today: string = todayIso(),
): Subscription {
  if (sub.isActive !== 1) return sub;
  if (sub.endDate && sub.endDate.slice(0, 10) < today) return sub;
  let current = sub;
  let changed = false;
  while (current.nextBillDate.slice(0, 10) < today) {
    current = advanceCycle(current);
    changed = true;
  }
  return changed ? current : sub;
}
