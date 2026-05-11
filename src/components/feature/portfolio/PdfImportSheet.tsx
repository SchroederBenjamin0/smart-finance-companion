import { useState } from 'react';
import { CheckCircle2, FileText, Loader2, Upload } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { positionsRepo } from '@/db/repositories/positions';
import type { InvestmentPosition } from '@/db/types';
import { formatEur, parseEurInput, round2 } from '@/lib/currency';
import { generateId } from '@/lib/id';
import { nowIso } from '@/lib/date';
import { parseTrPortfolioPdf, type ParsedHolding } from '@/services/trPdfImport';
import { useToastStore } from '@/stores/toast';

type Stage = 'pick' | 'parsing' | 'review' | 'saving' | 'done';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingPositions: InvestmentPosition[];
  onImported: () => void;
}

interface DraftRow extends ParsedHolding {
  totalInvestedText: string;
  existing?: InvestmentPosition;
  enabled: boolean;
}

export function PdfImportSheet({
  open,
  onOpenChange,
  existingPositions,
  onImported,
}: Props) {
  const [stage, setStage] = useState<Stage>('pick');
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [date, setDate] = useState('');
  const pushToast = useToastStore((s) => s.push);

  function reset() {
    setStage('pick');
    setError(null);
    setDrafts([]);
    setDate('');
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStage('parsing');
    setError(null);
    const result = await parseTrPortfolioPdf(file);
    if (!result.ok) {
      setError(result.error.message);
      setStage('pick');
      return;
    }
    if (result.value.holdings.length === 0) {
      setError(
        'Keine Holdings erkannt. Stelle sicher, dass es eine TR-Vermögensübersicht ist.',
      );
      setStage('pick');
      return;
    }
    setDate(result.value.date);
    setDrafts(
      result.value.holdings.map((h) => {
        const existing = existingPositions.find(
          (p) => p.isin.toUpperCase() === h.isin.toUpperCase(),
        );
        return {
          ...h,
          existing,
          enabled: true,
          totalInvestedText: existing
            ? String(existing.totalInvested)
            : String(h.currentValue),
        };
      }),
    );
    setStage('review');
  }

  async function importAll() {
    setStage('saving');
    let created = 0;
    let updated = 0;
    for (const d of drafts) {
      if (!d.enabled) continue;
      const invested = parseEurInput(d.totalInvestedText) ?? d.currentValue;
      const ts = nowIso();
      const pos: InvestmentPosition = d.existing
        ? {
            ...d.existing,
            shares: d.shares,
            currentValue: round2(d.currentValue),
            lastSyncedPrice: ts,
            totalInvested: round2(invested),
            ticker: d.existing.ticker || d.ticker,
          }
        : {
            id: generateId(),
            ticker: d.ticker,
            isin: d.isin,
            name: d.name,
            assetType: d.assetType,
            totalInvested: round2(invested),
            shares: d.shares,
            currentValue: round2(d.currentValue),
            lastSyncedPrice: ts,
            targetPercentage: 0,
          };
      const r = await positionsRepo.upsert(pos);
      if (r.ok) {
        d.existing ? updated++ : created++;
      }
    }
    onImported();
    pushToast(`${created} neu, ${updated} aktualisiert`, 'success');
    setStage('done');
    setTimeout(() => {
      onOpenChange(false);
      reset();
    }, 800);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="PDF-Import"
      footer={
        stage === 'review' ? (
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => void importAll()}
            disabled={drafts.every((d) => !d.enabled)}
          >
            {drafts.filter((d) => d.enabled).length} Position(en) übernehmen
          </button>
        ) : undefined
      }
    >
      {stage === 'pick' && (
        <div className="space-y-4 pt-2">
          <p className="text-sm text-ink-muted">
            Lade deine Trade-Republic-Vermögensübersicht (PDF) hoch. Die App
            extrahiert Holdings, ISIN, Anteile und aktuellen Kurswert. Du
            kannst alles vor dem Speichern noch prüfen.
          </p>
          <label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-forest-950/20 bg-surface text-ink-muted transition active:scale-[0.99]">
            <Upload className="h-6 w-6" strokeWidth={2.25} />
            <span className="text-sm font-medium">PDF auswählen</span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={handleFile}
            />
          </label>
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      )}

      {stage === 'parsing' && (
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-ink-muted">
          <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2.25} />
          <p className="text-sm">PDF wird analysiert…</p>
        </div>
      )}

      {stage === 'saving' && (
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-ink-muted">
          <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2.25} />
          <p className="text-sm">Speichere…</p>
        </div>
      )}

      {stage === 'done' && (
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-emerald-700">
          <CheckCircle2 className="h-8 w-8" strokeWidth={2} />
          <p className="text-sm font-medium">Import abgeschlossen</p>
        </div>
      )}

      {stage === 'review' && (
        <div className="space-y-3 pt-1 pb-2">
          <div className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2 text-[12px] text-ink-muted">
            <FileText className="h-4 w-4" strokeWidth={2.25} />
            Vermögensübersicht zum {date} · {drafts.length} Holdings erkannt
          </div>
          <p className="text-[12px] text-ink-subtle">
            Eingezahlt-Wert ist standardmäßig der aktuelle Kurswert. Wenn du
            deinen tatsächlichen Kaufpreis kennst, hier eintragen — sonst
            zeigt die Performance erstmal 0 %.
          </p>

          {drafts.map((d, i) => (
            <div
              key={`${d.isin}-${i}`}
              className="rounded-2xl border border-forest-950/10 bg-surface p-3"
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={d.enabled}
                  onChange={(e) =>
                    setDrafts((arr) =>
                      arr.map((x, idx) =>
                        idx === i ? { ...x, enabled: e.target.checked } : x,
                      ),
                    )
                  }
                  className="mt-1 h-4 w-4 accent-forest-950"
                  aria-label={`${d.name} importieren`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-ink">
                    {d.name}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-subtle">
                    <span>{d.isin}</span>
                    <span>{d.shares} Stk.</span>
                    <span>aktuell {formatEur(d.currentValue)}</span>
                    {d.ticker ? (
                      <span className="rounded-full bg-forest-100 px-1.5 py-0.5 text-[10px] font-bold text-forest-800">
                        {d.ticker}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        Ticker fehlt
                      </span>
                    )}
                  </div>
                  {d.existing && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-[11px] text-ink-subtle">
                      Aktualisiert bestehende Position
                    </div>
                  )}
                </div>
              </div>
              {d.enabled && (
                <div className="mt-3 flex items-center gap-2">
                  <label
                    className="text-[12px] text-ink-subtle"
                    htmlFor={`inv-${i}`}
                  >
                    Eingezahlt
                  </label>
                  <input
                    id={`inv-${i}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    className="input-field h-10 flex-1 tabular-nums text-right"
                    value={d.totalInvestedText}
                    onChange={(e) =>
                      setDrafts((arr) =>
                        arr.map((x, idx) =>
                          idx === i
                            ? { ...x, totalInvestedText: e.target.value }
                            : x,
                        ),
                      )
                    }
                  />
                  <span className="text-[12px] text-ink-subtle">€</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
