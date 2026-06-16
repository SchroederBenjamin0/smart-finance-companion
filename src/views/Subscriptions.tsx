import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Plus } from 'lucide-react';
import { HeroHeader } from '@/components/layout/HeroHeader';
import { SubscriptionForm } from '@/components/feature/subscriptions/SubscriptionForm';
import { subscriptionsRepo } from '@/db/repositories/subscriptions';
import type { Subscription } from '@/db/types';
import { formatEur } from '@/lib/currency';
import { daysSince, formatDateDe, todayIso } from '@/lib/date';
import {
  markBilledOn,
  rollForwardOverdue,
} from '@/modules/subscriptions/dueDetector';
import { useToastStore } from '@/stores/toast';

export function Subscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Subscription | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const pushToast = useToastStore((s) => s.push);

  const reload = useCallback(async () => {
    const r = await subscriptionsRepo.findActive();
    if (!r.ok) {
      setLoaded(true);
      return;
    }
    const today = todayIso();
    const updates: Subscription[] = [];
    const rolled = r.value.map((sub) => {
      const next = rollForwardOverdue(sub, today);
      if (next !== sub) updates.push(next);
      return next;
    });
    if (updates.length > 0) {
      await subscriptionsRepo.upsertMany(updates);
    }
    rolled.sort((a, b) => a.nextBillDate.localeCompare(b.nextBillDate));
    setSubs(rolled);
    setLoaded(true);
  }, []);

  const markBilledToday = useCallback(
    async (sub: Subscription) => {
      const updated = markBilledOn(sub, todayIso());
      const r = await subscriptionsRepo.upsert(updated);
      if (!r.ok) {
        pushToast(`Fehler: ${r.error.message}`, 'error');
        return;
      }
      pushToast(`${sub.name} als heute abgebucht markiert`, 'success');
      await reload();
    },
    [pushToast, reload],
  );

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
        <p className="text-label font-medium uppercase tracking-wide text-mint-200">
          {subs.length} aktiv
        </p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight">
          Subscriptions
        </h1>
      </HeroHeader>

      <div className="px-4 pt-4 animate-view-enter">
        <div className="rounded-[22px] bg-surface p-5 shadow-card">
          <p className="text-label font-medium text-ink-subtle">
            Monatlicher Abfluss
          </p>
          <div className="mt-1 text-display font-semibold leading-none tabular-nums text-ink">
            {formatEur(totalMonthly)}
          </div>
          <p className="mt-2 text-meta text-ink-subtle">
            ≈ {formatEur(totalYearly)} / Jahr
          </p>
        </div>

        <div className="mt-5 row-divider overflow-hidden rounded-[22px] bg-surface shadow-card">
          {subs.map((s, i) => (
            <SubscriptionRow
              key={s.id}
              sub={s}
              onClick={() => setEditing(s)}
              onMarkBilledToday={() => void markBilledToday(s)}
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
  onMarkBilledToday,
  index,
}: {
  sub: Subscription;
  onClick: () => void;
  onMarkBilledToday: () => void;
  index: number;
}) {
  const initial = sub.name.trim().charAt(0).toUpperCase() || '·';
  const days = Math.max(0, Math.ceil(-daysSince(sub.nextBillDate)));
  const dueLabel = days === 0 ? 'heute' : `in ${days} Tagen`;
  const schedule =
    sub.billingCycle === 'monthly'
      ? `Monatlich · ${dueLabel}`
      : `Jährlich · ${dueLabel}`;
  const lastBilled = sub.lastBilledDate
    ? formatDateDe(sub.lastBilledDate)
    : null;
  return (
    <div
      className="flex w-full items-start gap-3 px-4 py-3 text-left animate-list-enter"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-start gap-3 text-left transition active:bg-paper -mx-4 -my-3 px-4 py-3"
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-body font-bold text-forest-800">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-semibold text-ink">
            {sub.name}
          </div>
          <div className="mt-0.5 text-meta text-ink-subtle">{schedule}</div>
          {lastBilled && (
            <div className="text-caption text-ink-subtle">
              Zuletzt abgebucht: {lastBilled}
            </div>
          )}
          {sub.endDate && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-caption font-medium text-amber-800">
              <Calendar className="h-3 w-3" strokeWidth={2.5} />
              Endet {formatDateDe(sub.endDate)}
            </div>
          )}
        </div>
      </button>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="text-body font-semibold tabular-nums text-ink">
          {formatEur(sub.amount)}
        </div>
        {sub.endDate && sub.lastBilledDate && <RemainingHint sub={sub} />}
        <button
          type="button"
          onClick={onMarkBilledToday}
          aria-label="Als heute abgebucht markieren"
          className="inline-flex items-center gap-1 rounded-full bg-forest-100 px-2 py-1 text-caption font-semibold text-forest-800 transition active:scale-[0.95]"
        >
          <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
          Heute
        </button>
      </div>
    </div>
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
    <div className="mt-0.5 text-caption text-amber-800">
      {remaining}× · {formatEur(total)}
    </div>
  );
}
