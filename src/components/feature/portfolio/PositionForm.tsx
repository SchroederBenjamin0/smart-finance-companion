import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { positionsRepo } from '@/db/repositories/positions';
import type { AssetType, InvestmentPosition } from '@/db/types';
import { parseEurInput, round2 } from '@/lib/currency';
import { generateId } from '@/lib/id';
import { nowIso } from '@/lib/date';
import { tickerFromIsin } from '@/services/yahoo';
import { useToastStore } from '@/stores/toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: InvestmentPosition;
  onSaved: () => void;
}

export function PositionForm({
  open,
  onOpenChange,
  initial,
  onSaved,
}: Props) {
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [isin, setIsin] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('etf');
  const [sharesText, setSharesText] = useState('');
  const [investedText, setInvestedText] = useState('');
  const [targetText, setTargetText] = useState('');
  const [saving, setSaving] = useState(false);
  const pushToast = useToastStore((s) => s.push);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setTicker(initial.ticker);
      setIsin(initial.isin);
      setAssetType(initial.assetType);
      setSharesText(String(initial.shares));
      setInvestedText(String(initial.totalInvested));
      setTargetText(
        initial.targetPercentage > 0 ? String(initial.targetPercentage) : '',
      );
    } else {
      setName('');
      setTicker('');
      setIsin('');
      setAssetType('etf');
      setSharesText('');
      setInvestedText('');
      setTargetText('');
    }
  }, [open, initial]);

  const shares = parseEurInput(sharesText) ?? NaN;
  const invested = parseEurInput(investedText);
  const target = parseEurInput(targetText) ?? NaN;

  const canSave =
    name.trim().length > 0 &&
    ticker.trim().length > 0 &&
    Number.isFinite(shares) &&
    shares > 0 &&
    invested !== null &&
    invested >= 0;

  function handleIsinBlur() {
    if (!isin || ticker) return;
    const inferred = tickerFromIsin(isin.trim());
    if (inferred) setTicker(inferred);
  }

  async function save() {
    if (!canSave || invested === null) return;
    setSaving(true);
    const pos: InvestmentPosition = {
      id: initial?.id ?? generateId(),
      ticker: ticker.trim().toUpperCase(),
      isin: isin.trim().toUpperCase(),
      name: name.trim(),
      assetType,
      totalInvested: round2(invested),
      shares: round2(shares),
      currentValue: initial?.currentValue ?? round2(invested),
      lastSyncedPrice: initial?.lastSyncedPrice ?? nowIso(),
      targetPercentage:
        Number.isFinite(target) && target > 0 ? round2(target) : 0,
    };
    const r = await positionsRepo.upsert(pos);
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
    const r = await positionsRepo.remove(initial.id);
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
      title={initial ? 'Position bearbeiten' : 'Neue Position'}
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
            {saving ? 'Speichere…' : initial ? 'Speichern' : 'Hinzufügen'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <input
            type="text"
            className="input-field"
            placeholder="z.B. iShares Core MSCI World"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={!initial}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="ISIN (optional)">
            <input
              type="text"
              className="input-field uppercase"
              placeholder="IE00B4L5Y983"
              value={isin}
              onChange={(e) => setIsin(e.target.value)}
              onBlur={handleIsinBlur}
            />
          </Field>
          <Field label="Yahoo-Ticker">
            <input
              type="text"
              className="input-field uppercase"
              placeholder="IWDA.AS"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
            />
          </Field>
        </div>
        <p className="-mt-2 text-caption text-ink-subtle">
          Bekannte ISINs füllen den Ticker automatisch aus. Sonst auf{' '}
          <em>finance.yahoo.com</em> nachschlagen (z.B. „IWDA.AS").
        </p>

        <Field label="Typ">
          <div className="grid h-12 grid-cols-2 rounded-2xl border border-forest-950/10 bg-surface p-1">
            {(['etf', 'stock'] as AssetType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setAssetType(t)}
                className={`flex items-center justify-center rounded-xl text-sm font-semibold transition ${
                  assetType === t
                    ? 'bg-forest-950 text-white'
                    : 'text-ink-muted'
                }`}
              >
                {t === 'etf' ? 'ETF' : 'Aktie'}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Anteile">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="input-field tabular-nums"
              placeholder="0"
              value={sharesText}
              onChange={(e) => setSharesText(e.target.value)}
            />
          </Field>
          <Field label="Eingezahlt (€)">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="input-field tabular-nums"
              placeholder="0,00"
              value={investedText}
              onChange={(e) => setInvestedText(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Ziel-Anteil im Portfolio (%, optional)">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className="input-field tabular-nums"
            placeholder="z.B. 60"
            value={targetText}
            onChange={(e) => setTargetText(e.target.value)}
          />
          <p className="mt-1 text-caption text-ink-subtle">
            Wenn gesetzt, zeigt die App Drift gegenüber dem Soll-Anteil.
          </p>
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
      <span className="text-label font-medium text-ink">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
