import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Sparkles, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { positionsRepo } from '@/db/repositories/positions';
import type { InvestmentPosition } from '@/db/types';
import { DEFAULT_ALLOCATION_TARGET } from '@/db/types';
import { formatEur } from '@/lib/currency';
import {
  recommendAllocation,
  type AdvisorRecommendation,
} from '@/services/advisor';
import { tickerFromIsin, trDeepLink } from '@/services/yahoo';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Newly allocated investment amount from this income split. */
  investmentAmount: number;
  onSkip?: () => void;
}

type Stage = 'loading' | 'ready' | 'error' | 'empty';

export function AdvisorSheet({
  open,
  onOpenChange,
  investmentAmount,
  onSkip,
}: Props) {
  const [stage, setStage] = useState<Stage>('loading');
  const [error, setError] = useState<string | null>(null);
  const [rec, setRec] = useState<AdvisorRecommendation | null>(null);
  const [positions, setPositions] = useState<InvestmentPosition[]>([]);

  useEffect(() => {
    if (!open) return;
    setStage('loading');
    setError(null);
    setRec(null);
    void (async () => {
      const positionsR = await positionsRepo.findAll();
      const portfolio = positionsR.ok ? positionsR.value : [];
      setPositions(portfolio);

      if (investmentAmount <= 0) {
        setStage('empty');
        return;
      }

      const r = await recommendAllocation({
        availableEur: investmentAmount,
        portfolio,
        target: DEFAULT_ALLOCATION_TARGET,
      });
      if (!r.ok) {
        setError(r.error.message);
        setStage('error');
        return;
      }
      setRec(r.value);
      setStage('ready');
    })();
  }, [open, investmentAmount]);

  function isinForTicker(ticker: string): string | null {
    // Reverse-lookup: scan known map and the user's own positions.
    const own = positions.find(
      (p) => p.ticker.toUpperCase() === ticker.toUpperCase(),
    );
    if (own?.isin) return own.isin;
    // Hard-coded known ISINs that map back to common tickers
    const KNOWN: Record<string, string> = {
      'IWDA.AS': 'IE00B4L5Y983',
      'EIMI.DE': 'IE00BKM4GZ66',
      'CSNDX.DE': 'IE00B53SZB19',
      'IUSA.DE': 'IE00B0M62Q58',
    };
    if (KNOWN[ticker.toUpperCase()]) return KNOWN[ticker.toUpperCase()]!;
    return null;
  }

  // Suppress unused tickerFromIsin import — useful if we later add the
  // reverse-lookup. This noop keeps the import for tree-shaking clarity.
  void tickerFromIsin;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Sparplan-Vorschlag"
      footer={
        stage === 'ready' ? (
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => onOpenChange(false)}
          >
            Schließen
          </button>
        ) : (
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => {
              onSkip?.();
              onOpenChange(false);
            }}
          >
            Schließen
          </button>
        )
      }
    >
      {stage === 'loading' && (
        <div className="flex h-48 flex-col items-center justify-center gap-3 text-ink-muted">
          <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2.25} />
          <p className="text-sm">Claude denkt nach…</p>
          <p className="text-[12px] text-ink-subtle">
            Analyse deines Portfolios + Drift gegen Ziel-Allokation
          </p>
        </div>
      )}

      {stage === 'empty' && (
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-ink-muted">
          <p className="text-sm">Keine neuen Investment-Mittel zu verteilen.</p>
        </div>
      )}

      {stage === 'error' && (
        <div className="space-y-3 pt-2">
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <X className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
            <div>{error}</div>
          </div>
          <p className="text-[12px] text-ink-subtle">
            Häufigste Ursache: Anthropic-Key fehlt oder hat kein Guthaben. In
            den Settings prüfen.
          </p>
        </div>
      )}

      {stage === 'ready' && rec && (
        <div className="space-y-3 pb-2">
          <div className="flex items-start gap-3 rounded-2xl bg-mint-100 px-4 py-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-forest-950 text-white">
              <Sparkles className="h-4 w-4" strokeWidth={2.25} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-forest-800">
                Claude · Vorschlag
              </div>
              <p className="mt-0.5 text-[13px] leading-snug text-ink">
                {rec.summary}
              </p>
            </div>
          </div>

          {rec.driftWarning && (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-[12px] text-amber-800">
              {rec.driftWarning}
            </div>
          )}

          <div className="row-divider rounded-[22px] bg-white shadow-card">
            {rec.allocations.map((a, i) => {
              const isin = isinForTicker(a.ticker);
              return (
                <div
                  key={`${a.ticker}-${i}`}
                  className="flex items-start gap-3 px-4 py-3"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-[12px] font-bold text-forest-800">
                    {a.ticker.slice(0, 4) || 'ETF'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-ink">
                      {a.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-subtle">
                      {a.reason}
                    </div>
                    {isin && (
                      <a
                        href={trDeepLink(isin)}
                        target="_blank"
                        rel="noopener"
                        className="mt-2 inline-flex items-center gap-1 rounded-full bg-forest-950 px-2.5 py-0.5 text-[11px] font-semibold text-white"
                      >
                        In TR öffnen{' '}
                        <ExternalLink className="h-3 w-3" strokeWidth={2.5} />
                      </a>
                    )}
                  </div>
                  <div className="text-right text-[14px] font-semibold tabular-nums text-emerald-700">
                    {formatEur(a.amountEur)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded-xl bg-paper px-3 py-2 text-[12px]">
            <span className="font-medium text-ink-muted">Summe</span>
            <span className="font-mono font-semibold text-ink">
              {formatEur(rec.totalEur)}
            </span>
          </div>
        </div>
      )}
    </Sheet>
  );
}
