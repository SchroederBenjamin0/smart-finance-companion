import { useState } from 'react';
import { CheckCircle2, Loader2, Upload } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { positionsRepo } from '@/db/repositories/positions';
import type { InvestmentPosition } from '@/db/types';
import { round2 } from '@/lib/currency';
import { generateId } from '@/lib/id';
import { nowIso } from '@/lib/date';
import { parseTrPortfolioPdf } from '@/services/trPdfImport';
import { useToastStore } from '@/stores/toast';

type Stage = 'pick' | 'parsing' | 'saving' | 'done';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingPositions: InvestmentPosition[];
  onImported: () => void;
}

/**
 * One-shot PDF import: the file IS the portfolio. The whole existing
 * positions table is replaced with whatever the PDF contains — no review
 * step, no per-row toggles. The Investments view still lets the user edit
 * `totalInvested` or `targetPercentage` per position after the fact.
 */
export function PdfImportSheet({
  open,
  onOpenChange,
  existingPositions,
  onImported,
}: Props) {
  const [stage, setStage] = useState<Stage>('pick');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string>('');
  const pushToast = useToastStore((s) => s.push);

  function reset() {
    setStage('pick');
    setError(null);
    setSummary('');
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

    setStage('saving');
    const pdfIsins = new Set(
      result.value.holdings.map((h) => h.isin.toUpperCase()),
    );
    const existingByIsin = new Map(
      existingPositions.map((p) => [p.isin.toUpperCase(), p]),
    );
    const ts = nowIso();

    let created = 0;
    let updated = 0;
    let removed = 0;

    // 1. Upsert every PDF holding.
    //
    // totalInvested is RESET to currentValue on every PDF import. The TR
    // PDF doesn't expose your cost basis, so any previously stored value
    // is either (a) the current value of an earlier snapshot or (b) a
    // manual edit the user made via PositionForm. Both are stale once a
    // new PDF lands. Keeping them around produces fake performance
    // numbers (e.g. -42% from a buggy first import). Resetting means
    // performance % reflects "how the portfolio moved since the last
    // PDF import" — honest and meaningful.
    for (const h of result.value.holdings) {
      const prior = existingByIsin.get(h.isin.toUpperCase());
      const pos: InvestmentPosition = prior
        ? {
            ...prior,
            ticker: prior.ticker || h.ticker,
            name: h.name || prior.name,
            shares: h.shares,
            totalInvested: round2(h.currentValue),
            currentValue: round2(h.currentValue),
            lastSyncedPrice: ts,
          }
        : {
            id: generateId(),
            ticker: h.ticker,
            isin: h.isin,
            name: h.name,
            assetType: h.assetType,
            totalInvested: round2(h.currentValue),
            shares: h.shares,
            currentValue: round2(h.currentValue),
            lastSyncedPrice: ts,
            targetPercentage: 0,
          };
      const r = await positionsRepo.upsert(pos);
      if (r.ok) {
        prior ? updated++ : created++;
      }
    }

    // 2. Drop everything that isn't in the PDF — full snapshot semantics.
    for (const p of existingPositions) {
      if (pdfIsins.has(p.isin.toUpperCase())) continue;
      const r = await positionsRepo.remove(p.id);
      if (r.ok) removed++;
    }

    onImported();
    const parts: string[] = [];
    if (created > 0) parts.push(`${created} neu`);
    if (updated > 0) parts.push(`${updated} aktualisiert`);
    if (removed > 0) parts.push(`${removed} entfernt`);
    const summaryLine =
      parts.length > 0 ? parts.join(' · ') : 'Keine Änderung';
    setSummary(summaryLine);
    pushToast(summaryLine, 'success');
    setStage('done');
    setTimeout(() => {
      onOpenChange(false);
      reset();
    }, 1200);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="PDF-Import"
    >
      {stage === 'pick' && (
        <div className="space-y-4 pt-2">
          <p className="text-sm text-ink-muted">
            Lade deine Trade-Republic-Vermögensübersicht (PDF) hoch — die App
            ersetzt dein Portfolio komplett mit dem Inhalt des Dokuments.
            Positionen, die nicht im PDF stehen, werden entfernt.
          </p>
          <label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-control border-2 border-dashed border-forest-950/20 bg-surface text-ink-muted transition active:scale-[0.99]">
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
            <p className="rounded-chip border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      )}

      {(stage === 'parsing' || stage === 'saving') && (
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-ink-muted">
          <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2.25} />
          <p className="text-sm">
            {stage === 'parsing'
              ? 'PDF wird analysiert…'
              : 'Portfolio wird ersetzt…'}
          </p>
        </div>
      )}

      {stage === 'done' && (
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-8 w-8" strokeWidth={2} />
          <p className="text-sm font-medium">Import abgeschlossen</p>
          {summary && (
            <p className="text-meta text-ink-muted">{summary}</p>
          )}
        </div>
      )}
    </Sheet>
  );
}
