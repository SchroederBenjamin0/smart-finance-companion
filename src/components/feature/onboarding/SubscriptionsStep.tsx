import { useState } from 'react';
import { Switch } from '@/components/ui/Switch';
import { formatEur, parseEurInput } from '@/lib/currency';
import { addMonths } from '@/lib/date';
import type { SubscriptionDraft } from './types';

interface Props {
  subscriptions: SubscriptionDraft[];
  onChange: (subs: SubscriptionDraft[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export function SubscriptionsStep({
  subscriptions,
  onChange,
  onNext,
  onBack,
}: Props) {
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customAmount, setCustomAmount] = useState('');

  const totalMonthly = subscriptions
    .filter((s) => s.enabled)
    .reduce(
      (sum, s) =>
        sum + (s.billingCycle === 'monthly' ? s.amount : s.amount / 12),
      0,
    );

  const updateAt = (idx: number, patch: Partial<SubscriptionDraft>) => {
    const copy = [...subscriptions];
    copy[idx] = { ...copy[idx]!, ...patch };
    onChange(copy);
  };

  const addCustom = () => {
    const amount = parseEurInput(customAmount);
    if (!customName.trim() || amount === null || amount < 0) return;
    const today = new Date().toISOString();
    onChange([
      ...subscriptions,
      {
        name: customName.trim(),
        amount,
        currency: 'EUR',
        billingCycle: 'monthly',
        lastBilledDate: today,
        nextBillDate: addMonths(today, 1),
        endDate: null,
        category: 'Sonstiges',
        enabled: true,
      },
    ]);
    setCustomName('');
    setCustomAmount('');
    setShowCustomForm(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <h2 className="text-2xl font-semibold">Subscriptions</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Aktiviere die Subscriptions, die du tatsächlich hast. Beträge
          editierbar.
        </p>
        <div className="mt-3 rounded-xl bg-mint-100 dark:bg-mint-900/40 px-3 py-2 text-sm text-forest-950 dark:text-mint-100">
          Gesamt:{' '}
          <span className="font-mono font-semibold">
            {formatEur(totalMonthly)}
          </span>
          /Monat
        </div>

        <ul className="mt-4 space-y-2">
          {subscriptions.map((s, i) => (
            <li
              key={`${s.name}-${i}`}
              className="flex items-center gap-3 rounded-xl border border-forest-950/10 px-3 py-2"
            >
              <Switch
                checked={s.enabled}
                onChange={(c) => updateAt(i, { enabled: c })}
                ariaLabel={`${s.name} aktivieren`}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{s.name}</div>
                <div className="text-xs text-ink-subtle">
                  {s.category} · {s.billingCycle === 'monthly' ? 'monatlich' : 'jährlich'}
                </div>
              </div>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                aria-label={`${s.name} Betrag`}
                disabled={!s.enabled}
                className="h-10 w-24 rounded-lg border border-forest-950/15 bg-surface px-2 text-right text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-forest-700 disabled:opacity-50"
                value={String(s.amount)}
                onChange={(e) =>
                  updateAt(i, {
                    amount: parseEurInput(e.target.value) ?? 0,
                  })
                }
              />
            </li>
          ))}
        </ul>

        {showCustomForm ? (
          <div className="mt-3 rounded-xl border border-forest-950/15 p-3">
            <input
              type="text"
              placeholder="Name"
              className="input-field"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Betrag (€)"
              className="input-field mt-2 tabular-nums"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <button
                className="btn-secondary flex-1"
                onClick={() => {
                  setShowCustomForm(false);
                  setCustomName('');
                  setCustomAmount('');
                }}
              >
                Abbrechen
              </button>
              <button className="btn-primary flex-1" onClick={addCustom}>
                Hinzufügen
              </button>
            </div>
          </div>
        ) : (
          <button
            className="mt-3 w-full rounded-xl border border-dashed border-forest-950/15 py-3 text-sm font-medium text-ink-muted"
            onClick={() => setShowCustomForm(true)}
          >
            + Subscription hinzufügen
          </button>
        )}
      </div>

      <div className="mt-4 flex gap-3">
        <button className="btn-secondary flex-1" onClick={onBack}>
          Zurück
        </button>
        <button className="btn-primary flex-1" onClick={onNext}>
          Fertig
        </button>
      </div>
    </div>
  );
}
