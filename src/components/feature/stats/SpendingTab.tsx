import { useEffect, useState } from 'react';
import { transactionsRepo } from '@/db/repositories/transactions';
import {
  aggregateByCategory,
  filterByRange,
  type SpendingRange,
  type CategoryAggregateRow,
} from '@/modules/spending';
import { CategoryDrilldownSheet } from './CategoryDrilldownSheet';
import type { Transaction } from '@/db/types';

const RANGES: { value: SpendingRange; label: string }[] = [
  { value: 30, label: '30 Tage' },
  { value: 90, label: '90 Tage' },
  { value: 365, label: '365 Tage' },
  { value: 'all', label: 'Alle' },
];

export function SpendingTab() {
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [range, setRange] = useState<SpendingRange>(30);
  const [rows, setRows] = useState<CategoryAggregateRow[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const reload = async () => {
    const r = await transactionsRepo.findRecent(5000);
    if (r.ok) setAllTransactions(r.value);
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    const filtered = filterByRange(allTransactions, range, new Date());
    setRows(aggregateByCategory(filtered));
  }, [allTransactions, range]);

  const drilldownTransactions = selectedCategory
    ? filterByRange(allTransactions, range, new Date()).filter(
        (t) => t.category === selectedCategory && t.amount < 0,
      )
    : [];

  return (
    <div className="flex flex-col gap-4">
      {/* Range pills */}
      <div className="flex gap-2 px-1">
        {RANGES.map((r) => (
          <button
            key={String(r.value)}
            type="button"
            onClick={() => setRange(r.value)}
            className={`rounded-full px-3 py-1 text-label font-medium transition ${
              range === r.value
                ? 'bg-forest-700 text-white'
                : 'bg-paper text-ink-muted'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Category rows */}
      {rows.length === 0 ? (
        <div className="rounded-[22px] bg-surface p-6 text-center text-body text-ink-subtle shadow-card">
          Keine Ausgaben im gewählten Zeitraum.
        </div>
      ) : (
        <ul className="row-divider overflow-hidden rounded-[22px] bg-surface shadow-card">
          {rows.map((row) => (
            <li key={row.category}>
              <button
                type="button"
                onClick={() => setSelectedCategory(row.category)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition active:bg-paper"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-semibold capitalize text-ink">
                    {row.category}
                  </div>
                  <div className="truncate text-meta text-ink-subtle">
                    {row.count} {row.count === 1 ? 'Transaktion' : 'Transaktionen'}
                    {row.topCounterparty &&
                      ` · ${row.topCounterparty} (${row.topCounterpartyCount}×)`}
                  </div>
                </div>
                <div className="text-body font-semibold tabular-nums text-ink">
                  {row.total.toFixed(2)} €
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <CategoryDrilldownSheet
        category={selectedCategory}
        transactions={drilldownTransactions}
        onClose={() => setSelectedCategory(null)}
        onRecategorized={() => {
          void reload();
        }}
      />
    </div>
  );
}
