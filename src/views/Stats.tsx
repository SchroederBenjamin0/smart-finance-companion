import { useCallback, useEffect, useState } from 'react';
import { BarChart3, FileUp } from 'lucide-react';
import { HeroHeader } from '@/components/layout/HeroHeader';
import { CsvImportSheet } from '@/components/feature/imports/CsvImportSheet';
import { SpendingTab } from '@/components/feature/stats/SpendingTab';
import { CashflowTab } from '@/components/feature/stats/CashflowTab';
import { incomeRepo } from '@/db/repositories/income';
import { transactionsRepo } from '@/db/repositories/transactions';
import type { IncomeEntry, Transaction } from '@/db/types';
import { formatEur } from '@/lib/currency';
import { formatMonthYearDe } from '@/lib/date';

export function Stats() {
  const [tab, setTab] = useState<'overview' | 'spending' | 'cashflow'>('overview');
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [importing, setImporting] = useState(false);

  const reload = useCallback(async () => {
    const [iR, tR] = await Promise.all([
      incomeRepo.findAll(),
      transactionsRepo.findRecent(500),
    ]);
    if (iR.ok) setEntries(iR.value);
    if (tR.ok) setTransactions(tR.value);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const thisMonth = entries.filter((e) => e.date >= monthStart);
  const monthIncome = thisMonth.reduce((s, e) => s + e.amount, 0);

  const bySource = thisMonth.reduce<Record<string, number>>((acc, e) => {
    acc[e.source] = (acc[e.source] ?? 0) + e.amount;
    return acc;
  }, {});

  const monthExpenses = transactions.filter(
    (t) => t.date >= monthStart && t.amount < 0,
  );
  const totalExpenses = monthExpenses.reduce(
    (sum, t) => sum + Math.abs(t.amount),
    0,
  );
  const byCategory = monthExpenses.reduce<Record<string, number>>(
    (acc, t) => {
      acc[t.category] = (acc[t.category] ?? 0) + Math.abs(t.amount);
      return acc;
    },
    {},
  );
  const sortedCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <HeroHeader>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] font-medium uppercase tracking-wide text-mint-200">
              {formatMonthYearDe()}
            </p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight">Stats</h1>
          </div>
          <button
            type="button"
            onClick={() => setImporting(true)}
            aria-label="Revolut CSV importieren"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white"
          >
            <FileUp className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </div>
      </HeroHeader>

      <div className="px-4 pt-4 animate-view-enter">
        <div className="flex gap-1 rounded-full bg-paper p-1">
          <button
            type="button"
            onClick={() => setTab('overview')}
            className={`flex-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
              tab === 'overview' ? 'bg-white text-ink shadow-sm' : 'text-ink-muted'
            }`}
          >
            Übersicht
          </button>
          <button
            type="button"
            onClick={() => setTab('spending')}
            className={`flex-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
              tab === 'spending' ? 'bg-white text-ink shadow-sm' : 'text-ink-muted'
            }`}
          >
            Top-Kategorien
          </button>
          <button
            type="button"
            onClick={() => setTab('cashflow')}
            className={`flex-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
              tab === 'cashflow' ? 'bg-white text-ink shadow-sm' : 'text-ink-muted'
            }`}
          >
            Cashflow
          </button>
        </div>

        {tab === 'overview' && (
          <>
            <div className="mt-4 rounded-[22px] bg-white p-5 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[13px] font-medium text-ink-subtle">
                    Einnahmen
                  </p>
                  <div className="mt-1 text-[36px] font-semibold leading-none tabular-nums text-ink">
                    {formatEur(monthIncome)}
                  </div>
                  <p className="mt-2 text-[12px] text-ink-subtle">
                    diesen Monat
                  </p>
                </div>
                <div className="grid h-12 w-12 place-items-center rounded-full bg-forest-100 text-forest-800">
                  <BarChart3 className="h-5 w-5" strokeWidth={2.25} />
                </div>
              </div>
            </div>

            {Object.keys(bySource).length > 0 && (
              <div className="mt-5 row-divider rounded-[22px] bg-white shadow-card">
                {Object.entries(bySource).map(([src, amount]) => {
                  const pct = monthIncome > 0 ? (amount / monthIncome) * 100 : 0;
                  const label =
                    src === 'main_job'
                      ? 'Hauptjob'
                      : src === 'dj_gig'
                        ? 'DJ-Gigs'
                        : 'Sonstiges';
                  return (
                    <div
                      key={src}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-semibold text-ink">
                          {label}
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper">
                          <div
                            className="h-full rounded-full bg-forest-700"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[15px] font-semibold tabular-nums text-ink">
                          {formatEur(amount)}
                        </div>
                        <div className="text-[11px] text-ink-subtle">
                          {Math.round(pct)} %
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {sortedCategories.length > 0 && (
              <>
                <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-wider text-ink-subtle">
                  Ausgaben nach Kategorie
                </h2>
                <div className="mt-3 rounded-[22px] bg-white p-4 shadow-card">
                  <div className="text-[13px] font-medium text-ink-subtle">
                    Gesamt diesen Monat
                  </div>
                  <div className="mt-1 text-[28px] font-semibold leading-none tabular-nums text-ink">
                    −{formatEur(totalExpenses)}
                  </div>
                </div>
                <div className="mt-3 row-divider rounded-[22px] bg-white shadow-card">
                  {sortedCategories.map(([cat, amount]) => {
                    const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
                    return (
                      <div key={cat} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-semibold text-ink">
                            {cat}
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper">
                            <div
                              className="h-full rounded-full bg-forest-700"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[14px] font-semibold tabular-nums text-ink">
                            {formatEur(amount)}
                          </div>
                          <div className="text-[11px] text-ink-subtle">
                            {Math.round(pct)} %
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {sortedCategories.length === 0 && (
              <p className="mt-5 text-center text-[12px] text-ink-subtle">
                Tippe auf 📤 oben rechts, um eine Revolut-CSV zu importieren.
              </p>
            )}
          </>
        )}

        {tab === 'spending' && <SpendingTab />}

        {tab === 'cashflow' && <CashflowTab />}
      </div>

      <CsvImportSheet
        open={importing}
        onOpenChange={setImporting}
        existingTransactions={transactions}
        onImported={() => void reload()}
      />
    </>
  );
}
