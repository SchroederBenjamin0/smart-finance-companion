import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  FileUp,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { HeroHeader } from '@/components/layout/HeroHeader';
import { PdfImportSheet } from '@/components/feature/portfolio/PdfImportSheet';
import { PositionForm } from '@/components/feature/portfolio/PositionForm';
import { positionsRepo } from '@/db/repositories/positions';
import type { InvestmentPosition } from '@/db/types';
import { formatEur, formatPercent, round2 } from '@/lib/currency';
import { hoursSince, nowIso } from '@/lib/date';
import { fetchQuotes, trDeepLink } from '@/services/yahoo';
import { useToastStore } from '@/stores/toast';

export function Investments() {
  const [positions, setPositions] = useState<InvestmentPosition[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<InvestmentPosition | undefined>();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pushToast = useToastStore((s) => s.push);

  const reload = useCallback(async () => {
    const r = await positionsRepo.findAll();
    if (r.ok) setPositions(r.value);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Refresh prices automatically once at view-open if last sync > 4h ago.
  useEffect(() => {
    if (!loaded || positions.length === 0) return;
    const oldest = positions.reduce(
      (h, p) => Math.max(h, hoursSince(p.lastSyncedPrice)),
      0,
    );
    if (oldest > 4 && !refreshing) {
      void refreshPrices(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  async function refreshPrices(silent = false) {
    if (positions.length === 0) return;
    setRefreshing(true);
    const tickers = [...new Set(positions.map((p) => p.ticker).filter(Boolean))];
    const r = await fetchQuotes(tickers);
    if (!r.ok) {
      if (!silent) pushToast(`Yahoo: ${r.error.message}`, 'error');
      setRefreshing(false);
      return;
    }
    const priceBy: Record<string, number> = {};
    for (const q of r.value) priceBy[q.symbol] = q.price;
    const ts = nowIso();
    let hits = 0;
    for (const p of positions) {
      const px = priceBy[p.ticker];
      if (typeof px === 'number' && px > 0) {
        hits++;
        await positionsRepo.upsert({
          ...p,
          currentValue: round2(p.shares * px),
          lastSyncedPrice: ts,
        });
      }
    }
    await reload();
    if (!silent) pushToast(`${hits}/${positions.length} aktualisiert`, 'success');
    setRefreshing(false);
  }

  const totals = useMemo(() => {
    const value = positions.reduce((s, p) => s + p.currentValue, 0);
    const invested = positions.reduce((s, p) => s + p.totalInvested, 0);
    return {
      value,
      invested,
      gainAbs: value - invested,
      gainPct: invested > 0 ? ((value - invested) / invested) * 100 : 0,
    };
  }, [positions]);

  return (
    <>
      <HeroHeader>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium uppercase tracking-wide text-mint-200">
              Trade Republic
            </p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight">
              Portfolio
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setImporting(true)}
              aria-label="Aus PDF importieren"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white"
            >
              <FileUp className="h-5 w-5" strokeWidth={2.25} />
            </button>
            <button
              type="button"
              onClick={() => void refreshPrices(false)}
              disabled={refreshing || positions.length === 0}
              aria-label="Preise aktualisieren"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white disabled:opacity-50"
            >
              <RefreshCw
                className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`}
                strokeWidth={2.25}
              />
            </button>
          </div>
        </div>
      </HeroHeader>

      <div className="px-4 pt-4 animate-view-enter">
        <div className="rounded-[22px] bg-white p-5 shadow-card">
          <p className="text-[13px] font-medium text-ink-subtle">
            Aktuell investiert
          </p>
          <div className="mt-1 text-[36px] font-semibold leading-none tabular-nums text-ink">
            {formatEur(totals.value)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
            <span className="rounded-full bg-paper px-2.5 py-1 text-ink-subtle">
              Eingezahlt {formatEur(totals.invested)}
            </span>
            {totals.invested > 0 && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${
                  totals.gainAbs >= 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700'
                }`}
              >
                {totals.gainAbs >= 0 ? (
                  <TrendingUp className="h-3 w-3" strokeWidth={3} />
                ) : (
                  <TrendingDown className="h-3 w-3" strokeWidth={3} />
                )}
                {formatPercent(totals.gainPct)} ·{' '}
                {totals.gainAbs >= 0 ? '+' : ''}
                {formatEur(totals.gainAbs)}
              </span>
            )}
          </div>
        </div>

        {positions.length === 0 && loaded && (
          <div className="mt-5 flex items-start gap-3 rounded-[22px] bg-white p-4 shadow-card">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-800">
              <Sparkles className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
                Erste Position
              </div>
              <p className="mt-0.5 text-[13px] leading-snug text-ink">
                Tippe auf <strong>+</strong>, um deine erste Holding zu
                erfassen. ISIN auto-vervollständigt bekannte ETFs.
              </p>
            </div>
          </div>
        )}

        {positions.length > 0 && (
          <>
            <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-wider text-ink-subtle">
              Holdings & Drift
            </h2>
            <ul className="mt-3 space-y-2">
              {positions.map((p, i) => (
                <PositionRow
                  key={p.id}
                  position={p}
                  totalValue={totals.value}
                  onClick={() => setEditing(p)}
                  index={i}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => setCreating(true)}
        aria-label="Position hinzufügen"
        className="fixed right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-forest-950 text-white shadow-nav transition active:scale-[0.94]"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      <PositionForm
        open={creating}
        onOpenChange={setCreating}
        onSaved={() => void reload()}
      />
      <PositionForm
        open={editing !== undefined}
        onOpenChange={(o) => {
          if (!o) setEditing(undefined);
        }}
        initial={editing}
        onSaved={() => void reload()}
      />
      <PdfImportSheet
        open={importing}
        onOpenChange={setImporting}
        existingPositions={positions}
        onImported={() => void reload()}
      />
    </>
  );
}

function PositionRow({
  position,
  totalValue,
  onClick,
  index,
}: {
  position: InvestmentPosition;
  totalValue: number;
  onClick: () => void;
  index: number;
}) {
  const currentPct = totalValue > 0 ? (position.currentValue / totalValue) * 100 : 0;
  const drift =
    position.targetPercentage > 0 ? currentPct - position.targetPercentage : null;
  const gainAbs = position.currentValue - position.totalInvested;
  const gainPct =
    position.totalInvested > 0 ? (gainAbs / position.totalInvested) * 100 : 0;

  return (
    <li
      className="animate-list-enter"
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <button
        type="button"
        onClick={onClick}
        className="block w-full rounded-[22px] bg-white p-4 text-left shadow-card transition active:scale-[0.99]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-forest-100 text-[12px] font-bold text-forest-800">
                {position.ticker.slice(0, 4)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-ink">
                  {position.name}
                </div>
                <div className="text-[11px] text-ink-subtle">
                  {position.shares} · {position.ticker}
                </div>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[15px] font-semibold tabular-nums text-ink">
              {formatEur(position.currentValue)}
            </div>
            <div
              className={`text-[11px] font-medium tabular-nums ${
                gainAbs >= 0 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {formatPercent(gainPct)}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-[12px]">
          <span className="text-ink-subtle">
            {currentPct.toFixed(1)}%
            {position.targetPercentage > 0 && (
              <> / {position.targetPercentage}% Ziel</>
            )}
          </span>
          {drift !== null && Math.abs(drift) > 0.5 && (
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ${
                Math.abs(drift) > 4
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-paper text-ink-subtle'
              }`}
            >
              {drift > 0 ? '+' : ''}
              {drift.toFixed(1)}% Drift
            </span>
          )}
          {position.isin && (
            <a
              href={trDeepLink(position.isin)}
              target="_blank"
              rel="noopener"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-full bg-forest-950 px-2.5 py-0.5 font-semibold text-white"
            >
              In TR <ExternalLink className="h-3 w-3" strokeWidth={2.5} />
            </a>
          )}
        </div>
      </button>
    </li>
  );
}
