import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Switch } from '@/components/ui/Switch';
import { subscriptionsRepo } from '@/db/repositories/subscriptions';
import type { BillingCycle, Subscription } from '@/db/types';
import { formatEur, parseEurInput, round2 } from '@/lib/currency';
import { addMonths, formatDateDe, todayIso } from '@/lib/date';
import { generateId } from '@/lib/id';
import { useToastStore } from '@/stores/toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Subscription;
  onSaved: () => void;
}

export function SubscriptionForm({
  open,
  onOpenChange,
  initial,
  onSaved,
}: Props) {
  const [name, setName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [lastBilledDate, setLastBilledDate] = useState('');
  const [endDateEnabled, setEndDateEnabled] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const pushToast = useToastStore((s) => s.push);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setAmountText(String(initial.amount));
      setCycle(initial.billingCycle);
      setLastBilledDate(
        initial.lastBilledDate?.slice(0, 10) ??
          backInferLastBilled(initial.nextBillDate, initial.billingCycle),
      );
      setEndDateEnabled(initial.endDate !== null);
      setEndDate(initial.endDate?.slice(0, 10) ?? '');
      setCategory(initial.category);
    } else {
      setName('');
      setAmountText('');
      setCycle('monthly');
      setLastBilledDate(todayIso());
      setEndDateEnabled(false);
      setEndDate('');
      setCategory('');
    }
  }, [open, initial]);

  const amount = parseEurInput(amountText);
  const nextBillDate = useMemo(() => {
    if (!lastBilledDate) return '';
    return addMonths(`${lastBilledDate}T00:00:00Z`, cycle === 'monthly' ? 1 : 12);
  }, [lastBilledDate, cycle]);

  const remainingPayments = useMemo(() => {
    if (!endDateEnabled || !endDate || !lastBilledDate) return null;
    const end = new Date(`${endDate}T00:00:00Z`);
    const last = new Date(`${lastBilledDate}T00:00:00Z`);
    const months =
      (end.getUTCFullYear() - last.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - last.getUTCMonth());
    if (cycle === 'monthly') return Math.max(0, months);
    return Math.max(0, Math.round(months / 12));
  }, [endDateEnabled, endDate, lastBilledDate, cycle]);

  const canSave =
    name.trim().length > 0 &&
    amount !== null &&
    amount > 0 &&
    lastBilledDate !== '' &&
    (!endDateEnabled || endDate !== '');

  async function save() {
    if (!canSave || amount === null) return;
    setSaving(true);
    const sub: Subscription = {
      id: initial?.id ?? generateId(),
      name: name.trim(),
      amount: round2(amount),
      currency: 'EUR',
      billingCycle: cycle,
      lastBilledDate: `${lastBilledDate}T00:00:00Z`,
      nextBillDate,
      endDate: endDateEnabled && endDate ? `${endDate}T00:00:00Z` : null,
      category: category.trim() || 'Sonstiges',
      isActive: 1,
    };
    const r = await subscriptionsRepo.upsert(sub);
    if (!r.ok) {
      pushToast(`Fehler: ${r.error.message}`, 'error');
    } else {
      pushToast(initial ? 'Aktualisiert' : 'Hinzugefügt', 'success');
      onSaved();
      onOpenChange(false);
    }
    setSaving(false);
  }

  async function remove() {
    if (!initial) return;
    if (!window.confirm(`„${initial.name}" wirklich löschen?`)) return;
    const r = await subscriptionsRepo.remove(initial.id);
    if (!r.ok) {
      pushToast(`Fehler: ${r.error.message}`, 'error');
    } else {
      pushToast('Gelöscht', 'success');
      onSaved();
      onOpenChange(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? 'Subscription bearbeiten' : 'Neue Subscription'}
      footer={
        <div className="flex gap-2">
          {initial && (
            <button
              type="button"
              className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600 transition active:scale-[0.96]"
              onClick={() => void remove()}
              aria-label="Löschen"
            >
              <Trash2 className="h-4 w-4" strokeWidth={2.5} />
            </button>
          )}
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={!canSave || saving}
            onClick={() => void save()}
          >
            {saving ? 'Speichere…' : initial ? 'Änderungen speichern' : 'Hinzufügen'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <input
            type="text"
            className="input-field"
            placeholder="z.B. Ableton Live"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={!initial}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Betrag (€)">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="input-field tabular-nums"
              placeholder="0,00"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
            />
          </Field>
          <Field label="Zyklus">
            <div className="grid h-12 grid-cols-2 rounded-2xl border border-forest-950/10 bg-surface p-1">
              {(['monthly', 'yearly'] as BillingCycle[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCycle(c)}
                  className={`flex items-center justify-center rounded-xl text-sm font-semibold transition ${
                    cycle === c
                      ? 'bg-forest-950 text-white'
                      : 'text-ink-muted'
                  }`}
                >
                  {c === 'monthly' ? 'Monatlich' : 'Jährlich'}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Letzte Abbuchung">
          <input
            type="date"
            className="input-field"
            value={lastBilledDate}
            onChange={(e) => setLastBilledDate(e.target.value)}
          />
          {nextBillDate && (
            <p className="mt-1 text-[12px] text-ink-subtle">
              Nächste Abbuchung: <strong>{formatDateDe(nextBillDate)}</strong>
            </p>
          )}
        </Field>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink">
              End-Datum (Rent-to-Own)
            </span>
            <Switch
              checked={endDateEnabled}
              onChange={setEndDateEnabled}
              ariaLabel="End-Datum aktivieren"
            />
          </div>
          {endDateEnabled && (
            <div className="mt-2">
              <input
                type="date"
                className="input-field"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              {remainingPayments !== null && amount !== null && (
                <p className="mt-1 text-[12px] text-ink-subtle">
                  {remainingPayments} {cycle === 'monthly' ? 'Monate' : 'Jahre'}{' '}
                  übrig · noch{' '}
                  <strong className="tabular-nums">
                    {formatEur(round2(remainingPayments * amount))}
                  </strong>
                </p>
              )}
            </div>
          )}
        </div>

        <Field label="Kategorie">
          <input
            type="text"
            className="input-field"
            placeholder="z.B. Music-Tools"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </Field>
      </div>
    </Sheet>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

/**
 * If a subscription has only `nextBillDate` (legacy data), best-guess the
 * last billing date by stepping back one cycle. Returns YYYY-MM-DD.
 */
function backInferLastBilled(
  nextIso: string,
  cycle: BillingCycle,
): string {
  const months = cycle === 'monthly' ? -1 : -12;
  return addMonths(nextIso, months).slice(0, 10);
}
