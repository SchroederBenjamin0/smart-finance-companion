import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { positionsRepo } from '@/db/repositories/positions';
import { recommendationsRepo } from '@/db/repositories/recommendations';
import type { InvestmentPosition, Recommendation } from '@/db/types';
import { DEFAULT_ALLOCATION_TARGET } from '@/db/types';
import { formatEur } from '@/lib/currency';
import { nowIso } from '@/lib/date';
import { generateId } from '@/lib/id';
import { BacktestPanel } from '@/components/feature/advisor/BacktestPanel';
import { RecommendationCard } from '@/components/feature/advisor/RecommendationCard';
import type { BacktestAllocation } from '@/modules/backtest';
import {
  recommendAllocation,
  type AdvisorRecommendation,
} from '@/services/advisor';
import { CLAUDE_MODELS } from '@/services/claude';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Newly allocated investment amount from this income split. */
  investmentAmount: number;
  /** If set, the resulting recommendation is persisted and linked to this income. */
  incomeEntryId?: string | null;
  onSkip?: () => void;
}

type Stage = 'loading' | 'ready' | 'error' | 'empty';

export function AdvisorSheet({
  open,
  onOpenChange,
  investmentAmount,
  incomeEntryId,
  onSkip,
}: Props) {
  const [stage, setStage] = useState<Stage>('loading');
  const [error, setError] = useState<string | null>(null);
  const [rec, setRec] = useState<AdvisorRecommendation | null>(null);
  const [positions, setPositions] = useState<InvestmentPosition[]>([]);

  // Derive allocation weights from current portfolio for the backtest panel.
  const backtestAllocation = useMemo<BacktestAllocation[]>(() => {
    const total = positions.reduce((s, p) => s + p.currentValue, 0);
    if (total <= 0) return [];
    return positions
      .filter((p) => p.ticker)
      .map((p) => ({ ticker: p.ticker, weight: p.currentValue / total }))
      .filter((a) => a.weight > 0.01);
  }, [positions]);

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

      // Persist for income history (one recommendation per income entry).
      if (incomeEntryId) {
        const record: Recommendation = {
          id: generateId(),
          date: nowIso(),
          trigger: 'income_event',
          availableAmount: investmentAmount,
          suggestionJson: JSON.stringify(r.value),
          rationale: r.value.summary,
          status: 'pending',
          userActionAt: null,
          incomeEntryId,
          modelName: CLAUDE_MODELS.SONNET,
        };
        void recommendationsRepo.upsert(record);
      }
    })();
  }, [open, investmentAmount, incomeEntryId]);

  // Resolve a missing isin against the user's own positions — covers legacy
  // recommendations that pre-date the TR-universe whitelist.
  function resolveIsin(a: { isin?: string; ticker?: string }): string {
    if (a.isin) return a.isin;
    if (!a.ticker) return '';
    const own = positions.find(
      (p) => p.ticker.toUpperCase() === a.ticker?.toUpperCase(),
    );
    return own?.isin ?? '';
  }

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
          <p className="text-meta text-ink-subtle">
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
          <div className="flex items-start gap-3 rounded-control border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <X className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
            <div>{error}</div>
          </div>
          <p className="text-meta text-ink-subtle">
            Häufigste Ursache: Anthropic-Key fehlt oder hat kein Guthaben. In
            den Settings prüfen.
          </p>
        </div>
      )}

      {stage === 'ready' && rec && (
        <div className="space-y-3 pb-2">
          {backtestAllocation.length > 0 && (
            <BacktestPanel
              allocation={backtestAllocation}
              monthlyContribution={investmentAmount > 0 ? investmentAmount : 500}
              years={10}
            />
          )}

          <div className="flex items-start gap-3 rounded-control bg-mint-100 px-4 py-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-forest-950 text-white">
              <Sparkles className="h-4 w-4" strokeWidth={2.25} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-caption font-bold uppercase tracking-wider text-forest-800">
                Claude · Vorschlag
              </div>
              <p className="mt-0.5 text-label leading-snug text-ink">
                {rec.summary}
              </p>
            </div>
          </div>

          {rec.driftWarning && (
            <div className="rounded-control bg-amber-50 px-4 py-3 text-meta text-amber-800">
              {rec.driftWarning}
            </div>
          )}

          <div className="space-y-2">
            {rec.allocations.map((a, i) => (
              <RecommendationCard
                key={`${a.isin || a.ticker}-${i}`}
                data={{
                  isin: resolveIsin(a),
                  ticker: a.ticker,
                  name: a.name,
                  amountEur: a.amountEur,
                  reason: a.reason,
                }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between rounded-chip bg-paper px-3 py-2 text-meta">
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
