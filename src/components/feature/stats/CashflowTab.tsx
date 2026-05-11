import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer } from 'recharts';
import { forecastCashflow, type WeeklyForecast } from '@/modules/forecast';
import { accountsRepo } from '@/db/repositories/accounts';
import { subscriptionsRepo } from '@/db/repositories/subscriptions';
import { transactionsRepo } from '@/db/repositories/transactions';
import { incomeRepo } from '@/db/repositories/income';
import { configRepo } from '@/db/repositories/config';
import { ALL_CONFIG_KEYS } from '@/db/types';

export function CashflowTab() {
  const [forecast, setForecast] = useState<WeeklyForecast[]>([]);
  const [threshold, setThreshold] = useState(100);

  useEffect(() => {
    void (async () => {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const [a, s, t, i, c] = await Promise.all([
        accountsRepo.findAll(),
        subscriptionsRepo.findActive(),
        transactionsRepo.findRecent(5000),
        incomeRepo.findSince(ninetyDaysAgo),
        configRepo.getRaw(ALL_CONFIG_KEYS.cashflowFunWarnThreshold),
      ]);
      if (c.ok && c.value) setThreshold(Number(c.value));
      const result = forecastCashflow({
        accounts: a.ok ? a.value : [],
        subscriptions: s.ok ? s.value : [],
        transactions: t.ok ? t.value : [],
        incomeEntries: i.ok ? i.value : [],
        weeks: 13,
        now: new Date(),
      });
      setForecast(result);
    })();
  }, []);

  if (forecast.length === 0) {
    return (
      <div className="rounded-[22px] bg-surface p-6 text-center text-[14px] text-ink-subtle shadow-card">
        Daten werden geladen...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[22px] bg-surface p-4 shadow-card">
        <div className="text-[14px] font-semibold text-ink">Fun-Konto — nächste 90 Tage</div>
        <div className="text-[11px] text-ink-subtle">
          Basiert auf Median der letzten 3 Monate. Variiert mit deinem Verhalten.
        </div>
        <div className="mt-3 h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={forecast}>
              <XAxis dataKey="weekStartIso" hide />
              <YAxis />
              <Tooltip />
              <ReferenceLine y={threshold} stroke="#f59e0b" strokeDasharray="4 4" />
              <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="funBalance"
                stroke="#0a2e1f"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-[22px] bg-surface p-4 shadow-card">
        <div className="mb-2 text-[14px] font-semibold text-ink">Anstehende Subscriptions</div>
        <ul className="text-[13px] text-ink-muted">
          {forecast.flatMap((w) =>
            w.events
              .filter((e) => e.type === 'subscription')
              .map((e, i) => (
                <li key={`${w.weekStartIso}-${i}`} className="flex items-center justify-between border-b border-divider py-1 last:border-b-0">
                  <span>{e.label}</span>
                  <span className="tabular-nums">{e.amount.toFixed(2)} € · KW {w.weekStartIso.slice(5)}</span>
                </li>
              )),
          )}
        </ul>
      </div>
    </div>
  );
}
