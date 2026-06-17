import type { InvestmentPosition } from '@/db/types';
import { findByIsin } from '@/data/tr-universe';

export const SECTOR_CAP_PCT = 35;
export const SINGLE_STOCK_CAP_PCT = 30;

/**
 * Broad, internally-diversified building blocks. A high weight here is NOT a
 * concentration risk (a world ETF at 60% is diversification), so these sectors
 * are exempt from sector over-concentration flagging. Tracks the broad-market
 * ETF sectors in TR_UNIVERSE. Narrow/thematic sectors (Tech, Semiconductors,
 * single industries, Gold) remain flaggable.
 */
export const BROAD_SECTORS: ReadonlySet<string> = new Set([
  'Global Equity',
  'Emerging Markets',
  'US Equity',
  'European Equity',
  'Euro Government Bonds',
]);

export interface SectorSlice {
  sector: string;
  valueEur: number;
  pct: number;
}

export type ConcentrationKind = 'sector' | 'position' | 'single-stock';

export interface ConcentrationFlag {
  kind: ConcentrationKind;
  ref: string;
  label: string;
  pct: number;
  capPct: number;
  overByEur: number;
}

export interface PortfolioAnalysis {
  totalValue: number;
  sectors: SectorSlice[];
  singleStockPct: number;
  flags: ConcentrationFlag[];
}

export interface AnalysisOptions {
  sectorCapPct: number;
  singleStockCapPct: number;
  driftTolerancePp: number;
}

export function sectorOf(position: InvestmentPosition): string {
  return findByIsin(position.isin)?.sector ?? 'Sonstige';
}

function isStock(position: InvestmentPosition): boolean {
  const u = findByIsin(position.isin);
  return u ? u.type === 'stock' : position.assetType === 'stock';
}

export function analyzePortfolio(
  positions: InvestmentPosition[],
  opts: AnalysisOptions,
): PortfolioAnalysis {
  const totalValue = positions.reduce((s, p) => s + p.currentValue, 0);
  if (totalValue <= 0) {
    return { totalValue: 0, sectors: [], singleStockPct: 0, flags: [] };
  }

  const sectorValue = new Map<string, number>();
  for (const p of positions) {
    const sec = sectorOf(p);
    sectorValue.set(sec, (sectorValue.get(sec) ?? 0) + p.currentValue);
  }
  const sectors: SectorSlice[] = Array.from(sectorValue.entries())
    .map(([sector, valueEur]) => ({ sector, valueEur, pct: (valueEur / totalValue) * 100 }))
    .sort((a, b) => b.valueEur - a.valueEur);

  const singleStockValue = positions.filter(isStock).reduce((s, p) => s + p.currentValue, 0);
  const singleStockPct = (singleStockValue / totalValue) * 100;

  const flags: ConcentrationFlag[] = [];

  for (const s of sectors) {
    if (
      s.pct > opts.sectorCapPct &&
      !BROAD_SECTORS.has(s.sector) &&
      s.sector !== 'Sonstige'
    ) {
      flags.push({
        kind: 'sector',
        ref: s.sector,
        label: s.sector,
        pct: s.pct,
        capPct: opts.sectorCapPct,
        overByEur: ((s.pct - opts.sectorCapPct) / 100) * totalValue,
      });
    }
  }

  for (const p of positions) {
    if (p.targetPercentage > 0) {
      const pct = (p.currentValue / totalValue) * 100;
      if (pct > p.targetPercentage + opts.driftTolerancePp) {
        flags.push({
          kind: 'position',
          ref: p.isin,
          label: p.name,
          pct,
          capPct: p.targetPercentage,
          overByEur: ((pct - p.targetPercentage) / 100) * totalValue,
        });
      }
    }
  }

  if (singleStockPct > opts.singleStockCapPct) {
    flags.push({
      kind: 'single-stock',
      ref: '',
      label: 'Einzelaktien',
      pct: singleStockPct,
      capPct: opts.singleStockCapPct,
      overByEur: ((singleStockPct - opts.singleStockCapPct) / 100) * totalValue,
    });
  }

  flags.sort((a, b) => b.overByEur - a.overByEur);
  return { totalValue, sectors, singleStockPct, flags };
}
