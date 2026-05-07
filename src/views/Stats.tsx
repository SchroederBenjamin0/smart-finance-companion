import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { HeroHeader } from '@/components/layout/HeroHeader';
import { incomeRepo } from '@/db/repositories/income';
import type { IncomeEntry } from '@/db/types';
import { formatEur } from '@/lib/currency';
import { formatMonthYearDe } from '@/lib/date';

export function Stats() {
  const [entries, setEntries] = useState<IncomeEntry[]>([]);

  useEffect(() => {
    void (async () => {
      const r = await incomeRepo.findAll();
      if (r.ok) setEntries(r.value);
    })();
  }, []);

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

  return (
    <>
      <HeroHeader>
        <p className="text-[13px] font-medium uppercase tracking-wide text-mint-200">
          {formatMonthYearDe()}
        </p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight">Stats</h1>
      </HeroHeader>

      <div className="px-4 pt-4 animate-view-enter">
        <div className="rounded-[22px] bg-white p-5 shadow-card">
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

        <p className="mt-5 text-center text-[12px] text-ink-subtle">
          Ausgaben-Statistik aus Revolut-CSV ab Sprint 2.
        </p>
      </div>
    </>
  );
}
