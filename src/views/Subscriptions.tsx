import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { HeroHeader } from '@/components/layout/HeroHeader';
import { subscriptionsRepo } from '@/db/repositories/subscriptions';
import type { Subscription } from '@/db/types';
import { formatEur } from '@/lib/currency';
import { daysSince, formatDateDe } from '@/lib/date';

export function Subscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await subscriptionsRepo.findActive();
      if (r.ok) setSubs(r.value);
      setLoaded(true);
    })();
  }, []);

  const totalMonthly = subs.reduce(
    (sum, s) =>
      sum + (s.billingCycle === 'monthly' ? s.amount : s.amount / 12),
    0,
  );
  const totalYearly = totalMonthly * 12;

  return (
    <>
      <HeroHeader>
        <p className="text-[13px] font-medium uppercase tracking-wide text-mint-200">
          {subs.length} aktiv
        </p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight">
          Subscriptions
        </h1>
      </HeroHeader>

      <div className="px-4 pt-4">
        <div className="rounded-[22px] bg-white p-5 shadow-card">
          <p className="text-[13px] font-medium text-ink-subtle">
            Monatlicher Abfluss
          </p>
          <div className="mt-1 text-[36px] font-semibold leading-none tabular-nums text-ink">
            {formatEur(totalMonthly)}
          </div>
          <p className="mt-2 text-[12px] text-ink-subtle">
            ≈ {formatEur(totalYearly)} / Jahr
          </p>
        </div>

        <div className="mt-5 row-divider rounded-[22px] bg-white shadow-card">
          {subs.map((s) => (
            <SubscriptionRow key={s.id} sub={s} />
          ))}
          {loaded && subs.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-ink-muted">
              Keine aktiven Subscriptions.
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-[12px] text-ink-subtle">
          Hinzufügen / Bearbeiten ab Sprint 2.
        </p>
      </div>
    </>
  );
}

function SubscriptionRow({ sub }: { sub: Subscription }) {
  const initial = sub.name.trim().charAt(0).toUpperCase() || '·';
  const days = Math.max(0, Math.ceil(-daysSince(sub.nextBillDate)));
  const schedule =
    sub.billingCycle === 'monthly'
      ? `Monatlich · in ${days} Tagen`
      : `Jährlich · in ${days} Tagen`;

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-[15px] font-bold text-forest-800">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-ink">
          {sub.name}
        </div>
        <div className="mt-0.5 text-[12px] text-ink-subtle">{schedule}</div>
        {sub.endDate && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            <Calendar className="h-3 w-3" strokeWidth={2.5} />
            Endet {formatDateDe(sub.endDate)}
          </div>
        )}
      </div>
      <div className="text-right">
        <div className="text-[15px] font-semibold tabular-nums text-ink">
          {formatEur(sub.amount)}
        </div>
      </div>
    </div>
  );
}
