import { useEffect, useState } from 'react';
import { AlertTriangle, OctagonAlert } from 'lucide-react';
import { forecastCashflow, shouldFireCashflow } from '@/modules/forecast';
import { accountsRepo } from '@/db/repositories/accounts';
import { subscriptionsRepo } from '@/db/repositories/subscriptions';
import { transactionsRepo } from '@/db/repositories/transactions';
import { incomeRepo } from '@/db/repositories/income';
import { configRepo } from '@/db/repositories/config';
import { ALL_CONFIG_KEYS } from '@/db/types';

interface Props {
  onClick?: () => void;
}

export function CashflowWarningBanner({ onClick }: Props) {
  const [severity, setSeverity] = useState<'yellow' | 'red' | null>(null);
  const [earliestWeek, setEarliestWeek] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

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
      const threshold = c.ok && c.value ? Number(c.value) : 100;
      const forecast = forecastCashflow({
        accounts: a.ok ? a.value : [],
        subscriptions: s.ok ? s.value : [],
        transactions: t.ok ? t.value : [],
        incomeEntries: i.ok ? i.value : [],
        weeks: 13,
        now: new Date(),
      });
      const r = shouldFireCashflow(
        forecast.map((f) => ({ weekStartIso: f.weekStartIso, funBalance: f.funBalance })),
        threshold,
      );
      setSeverity(r.severity);
      setEarliestWeek(r.earliestWeek);
    })();
  }, []);

  if (dismissed || !severity) return null;

  const bg =
    severity === 'red'
      ? 'bg-red-50 border-red-200 text-red-900'
      : 'bg-amber-50 border-amber-200 text-amber-900';
  const Icon = severity === 'red' ? OctagonAlert : AlertTriangle;
  const title =
    severity === 'red' ? 'Fun-Konto droht negativ zu werden' : 'Cashflow-Hinweis';

  return (
    <div className={`mb-3 rounded-control border p-4 ${bg}`}>
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onClick} className="flex-1 text-left">
          <div className="inline-flex items-center gap-1.5 text-body font-semibold">
            <Icon className="h-4 w-4" strokeWidth={2.25} />
            {title}
          </div>
          {earliestWeek && (
            <div className="mt-1 text-meta">Ab Woche {earliestWeek}</div>
          )}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-meta underline"
        >
          Schließen
        </button>
      </div>
    </div>
  );
}
