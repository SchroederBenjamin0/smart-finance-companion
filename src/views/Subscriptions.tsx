import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Plus } from 'lucide-react';
import { HeroHeader } from '@/components/layout/HeroHeader';
import { SubscriptionForm } from '@/components/feature/subscriptions/SubscriptionForm';
import { subscriptionsRepo } from '@/db/repositories/subscriptions';
import type { Subscription } from '@/db/types';
import { formatEur } from '@/lib/currency';
import { daysSince, formatDateDe } from '@/lib/date';

export function Subscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Subscription | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    const r = await subscriptionsRepo.findActive();
    if (r.ok) setSubs(r.value);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const totalMonthly = useMemo(
    () =>
      subs.reduce(
        (sum, s) =>
          sum + (s.billingCycle === 'monthly' ? s.amount : s.amount / 12),
        0,
      ),
    [subs],
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

      <div className="px-4 pt-4 animate-view-enter">
        <div className="rounded-[22px] bg-surface p-5 shadow-card">
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

        <div className="mt-5 row-divider overflow-hidden rounded-[22px] bg-surface shadow-card">
          {subs.map((s, i) => (
            <SubscriptionRow
              key={s.id}
              sub={s}
              onClick={() => setEditing(s)}
              index={i}
            />
          ))}
          {loaded && subs.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-ink-muted">
              Keine aktiven Subscriptions. Tippe „+", um eine hinzuzufügen.
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setCreating(true)}
        aria-label="Subscription hinzufügen"
        className="fixed right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-forest-950 text-white shadow-nav transition active:scale-[0.94]"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      <SubscriptionForm
        open={creating}
        onOpenChange={setCreating}
        onSaved={() => void reload()}
      />
      <SubscriptionForm
        open={editing !== undefined}
        onOpenChange={(o) => {
          if (!o) setEditing(undefined);
        }}
        initial={editing}
        onSaved={() => void reload()}
      />
    </>
  );
}

function SubscriptionRow({
  sub,
  onClick,
  index,
}: {
  sub: Subscription;
  onClick: () => void;
  index: number;
}) {
  const initial = sub.name.trim().charAt(0).toUpperCase() || '·';
  const days = Math.max(0, Math.ceil(-daysSince(sub.nextBillDate)));
  const schedule =
    sub.billingCycle === 'monthly'
      ? `Monatlich · in ${days} Tagen`
      : `Jährlich · in ${days} Tagen`;
  const lastBilled = sub.lastBilledDate
    ? formatDateDe(sub.lastBilledDate)
    : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 px-4 py-3 text-left transition active:bg-paper animate-list-enter"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-[15px] font-bold text-forest-800">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-ink">
          {sub.name}
        </div>
        <div className="mt-0.5 text-[12px] text-ink-subtle">{schedule}</div>
        {lastBilled && (
          <div className="text-[11px] text-ink-subtle">
            Zuletzt abgebucht: {lastBilled}
          </div>
        )}
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
        {sub.endDate && sub.lastBilledDate && (
          <RemainingHint sub={sub} />
        )}
      </div>
    </button>
  );
}

function RemainingHint({ sub }: { sub: Subscription }) {
  if (!sub.endDate || !sub.lastBilledDate) return null;
  const end = new Date(sub.endDate);
  const last = new Date(sub.lastBilledDate);
  const months =
    (end.getUTCFullYear() - last.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - last.getUTCMonth());
  const remaining =
    sub.billingCycle === 'monthly'
      ? Math.max(0, months)
      : Math.max(0, Math.round(months / 12));
  if (remaining === 0) return null;
  const total = remaining * sub.amount;
  return (
    <div className="mt-0.5 text-[11px] text-amber-800">
      {remaining}× · {formatEur(total)}
    </div>
  );
}
