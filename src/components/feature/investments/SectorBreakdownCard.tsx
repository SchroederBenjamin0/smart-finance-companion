import { TriangleAlert } from 'lucide-react';
import type { PortfolioAnalysis } from '@/modules/portfolio-analysis';

const SECTOR_COLORS = [
  '#0a4d2e', '#16a34a', '#10b981', '#22c55e', '#65a30d', '#0e7490',
  '#7c3aed', '#b45309', '#9aa6af',
];

interface Props {
  analysis: PortfolioAnalysis;
  /** compact = smaller variant for the AdvisorSheet (no outer card chrome) */
  compact?: boolean;
}

export function SectorBreakdownCard({ analysis, compact = false }: Props) {
  if (analysis.totalValue <= 0) {
    return (
      <div className="card">
        <div className="text-heading font-semibold text-ink">Diversifikation</div>
        <p className="mt-1 text-meta text-ink-subtle">
          Noch keine Positionen — Diversifikation erscheint nach dem ersten Import.
        </p>
      </div>
    );
  }

  const flaggedSectors = new Set(
    analysis.flags.filter((f) => f.kind === 'sector').map((f) => f.ref),
  );

  return (
    <div className={compact ? '' : 'card'}>
      {!compact && (
        <div className="text-heading font-semibold text-ink">Diversifikation</div>
      )}

      <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-paper">
        {analysis.sectors.map((s, i) => (
          <div
            key={s.sector}
            style={{ width: `${s.pct}%`, backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] }}
            title={`${s.sector} ${s.pct.toFixed(0)}%`}
          />
        ))}
      </div>

      <ul className="mt-3 space-y-1.5">
        {analysis.sectors.map((s, i) => (
          <li key={s.sector} className="flex items-center justify-between text-label">
            <span className="flex items-center gap-2 text-ink">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] }}
              />
              {s.sector}
              {flaggedSectors.has(s.sector) && (
                <TriangleAlert className="h-3.5 w-3.5 text-amber-600" strokeWidth={2.25} />
              )}
            </span>
            <span className="tabular-nums text-ink-muted">{s.pct.toFixed(0)}%</span>
          </li>
        ))}
      </ul>

      {analysis.flags.length > 0 && (
        <ul className="mt-3 space-y-1">
          {analysis.flags.map((f) => (
            <li
              key={`${f.kind}-${f.ref}`}
              className="flex items-start gap-2 rounded-chip bg-amber-50 px-3 py-2 text-meta text-amber-800"
            >
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
              <span>
                {f.label} bei {f.pct.toFixed(0)}% — über {f.capPct}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
