import type { Transaction } from '@/db/types';

export interface AnomalyResult {
  txId: string;
  amount: number;
  categoryMedian: number;
  factor: number;
}

export interface DetectOptions {
  minThreshold: number;     // default 50
  factor: number;           // default 3
  minHistoryMonths: number; // default 6
}

const DEFAULTS: DetectOptions = { minThreshold: 50, factor: 3, minHistoryMonths: 6 };

export function detectAnomalies(
  newTxs: Transaction[],
  historicalTxs: Transaction[],
  options: Partial<DetectOptions> = {},
): AnomalyResult[] {
  const opts = { ...DEFAULTS, ...options };
  const results: AnomalyResult[] = [];
  const byCategory = groupBy(historicalTxs, (t) => t.category);

  for (const tx of newTxs) {
    if (tx.amount >= 0) continue;
    const cat = byCategory.get(tx.category) ?? [];
    if (!hasEnoughHistory(cat, opts.minHistoryMonths)) continue;
    const amounts = cat.map((t) => Math.abs(t.amount)).filter((a) => a > 0);
    const median = computeMedian(amounts);
    if (median === 0) continue;
    const absAmount = Math.abs(tx.amount);
    if (absAmount < opts.minThreshold) continue;
    const factor = absAmount / median;
    if (factor > opts.factor) {
      results.push({ txId: tx.id, amount: tx.amount, categoryMedian: median, factor });
    }
  }
  return results;
}

function groupBy<T, K>(arr: T[], fn: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const item of arr) {
    const key = fn(item);
    const list = m.get(key) ?? [];
    list.push(item);
    m.set(key, list);
  }
  return m;
}

function computeMedian(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function hasEnoughHistory(txs: Transaction[], minMonths: number): boolean {
  if (txs.length < minMonths) return false;
  const months = new Set(txs.map((t) => t.date.slice(0, 7)));
  return months.size >= minMonths;
}
