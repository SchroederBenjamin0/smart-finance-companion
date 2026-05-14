import type { Transaction } from '@/db/types';

/**
 * Categories that look like outflows on the bank statement but don't
 * represent real spending — money moved between the user's own accounts
 * ("umbuchung"). Excluded from spending stats, cashflow forecasts and
 * anomaly detection. The `transfer` category — outgoing payments to
 * third parties (rent, friends, SEPA-Überweisungen) — IS real spending
 * and is NOT in this set.
 */
export const NON_SPENDING_CATEGORIES: ReadonlySet<string> = new Set([
  'umbuchung',
]);

export function isNonSpending(category: string): boolean {
  return NON_SPENDING_CATEGORIES.has(category);
}

export type SpendingRange = 30 | 90 | 365 | 'all';

export interface CategoryAggregateRow {
  category: string;
  total: number;
  count: number;
  topCounterparty: string;
  topCounterpartyCount: number;
}

export function filterByRange(txs: Transaction[], range: SpendingRange, now: Date): Transaction[] {
  if (range === 'all') return txs;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - range);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return txs.filter((t) => t.date >= cutoffIso);
}

export function aggregateByCategory(txs: Transaction[]): CategoryAggregateRow[] {
  const buckets = new Map<string, { total: number; count: number; counterparties: Map<string, number> }>();

  for (const t of txs) {
    if (t.amount >= 0) continue;
    if (isNonSpending(t.category)) continue;
    let bucket = buckets.get(t.category);
    if (!bucket) {
      bucket = { total: 0, count: 0, counterparties: new Map() };
      buckets.set(t.category, bucket);
    }
    bucket.total += Math.abs(t.amount);
    bucket.count += 1;
    bucket.counterparties.set(t.counterparty, (bucket.counterparties.get(t.counterparty) ?? 0) + 1);
  }

  const rows: CategoryAggregateRow[] = [];
  for (const [category, b] of buckets) {
    let topCounterparty = '';
    let topCounterpartyCount = 0;
    for (const [name, count] of b.counterparties) {
      if (count > topCounterpartyCount) {
        topCounterparty = name;
        topCounterpartyCount = count;
      }
    }
    rows.push({
      category,
      total: Math.round(b.total * 100) / 100,
      count: b.count,
      topCounterparty,
      topCounterpartyCount,
    });
  }
  rows.sort((a, b) => b.total - a.total);
  return rows;
}
