import { describe, it, expect } from 'vitest';
import {
  analyzePortfolio,
  SECTOR_CAP_PCT,
  SINGLE_STOCK_CAP_PCT,
} from '@/modules/portfolio-analysis';
import type { InvestmentPosition } from '@/db/types';

function pos(p: Partial<InvestmentPosition>): InvestmentPosition {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    ticker: p.ticker ?? '',
    isin: p.isin ?? '',
    name: p.name ?? 'X',
    assetType: p.assetType ?? 'etf',
    totalInvested: p.totalInvested ?? 0,
    shares: p.shares ?? 1,
    currentValue: p.currentValue ?? 0,
    lastSyncedPrice: p.lastSyncedPrice ?? '2026-06-01',
    targetPercentage: p.targetPercentage ?? 0,
  };
}

const OPTS = { sectorCapPct: SECTOR_CAP_PCT, singleStockCapPct: SINGLE_STOCK_CAP_PCT, driftTolerancePp: 5 };

describe('analyzePortfolio', () => {
  it('returns empty analysis for an empty portfolio', () => {
    const a = analyzePortfolio([], OPTS);
    expect(a.totalValue).toBe(0);
    expect(a.sectors).toEqual([]);
    expect(a.flags).toEqual([]);
  });

  it('aggregates value by sector from the TR universe, unknown ISIN -> Sonstige', () => {
    const a = analyzePortfolio(
      [
        pos({ isin: 'IE00B4L5Y983', currentValue: 600 }),
        pos({ isin: 'IE00B53SZB19', currentValue: 300 }),
        pos({ isin: 'XX0000000000', currentValue: 100 }),
      ],
      OPTS,
    );
    expect(a.totalValue).toBe(1000);
    const byName = Object.fromEntries(a.sectors.map((s) => [s.sector, s.pct]));
    expect(byName['Global Equity']).toBeCloseTo(60, 5);
    expect(byName['US Tech']).toBeCloseTo(30, 5);
    expect(byName['Sonstige']).toBeCloseTo(10, 5);
    expect(a.sectors[0]!.sector).toBe('Global Equity');
  });

  it('flags a sector over the cap with the euro headroom', () => {
    const a = analyzePortfolio(
      [
        pos({ isin: 'IE00B53SZB19', currentValue: 500 }),
        pos({ isin: 'IE00B4L5Y983', currentValue: 500 }),
      ],
      OPTS,
    );
    const f = a.flags.find((x) => x.kind === 'sector' && x.ref === 'US Tech');
    expect(f).toBeDefined();
    expect(f!.pct).toBeCloseTo(50, 5);
    expect(f!.capPct).toBe(35);
    expect(f!.overByEur).toBeCloseTo(150, 5);
  });

  it('flags a single position over its target + tolerance only when target > 0', () => {
    const a = analyzePortfolio(
      [
        pos({ isin: 'US67066G1040', name: 'NVIDIA', currentValue: 300, targetPercentage: 10 }),
        pos({ isin: 'IE00B4L5Y983', currentValue: 700, targetPercentage: 0 }),
      ],
      OPTS,
    );
    const f = a.flags.find((x) => x.kind === 'position' && x.ref === 'US67066G1040');
    expect(f).toBeDefined();
    expect(f!.capPct).toBe(10);
    expect(f!.overByEur).toBeCloseTo(200, 5);
    expect(a.flags.find((x) => x.kind === 'position' && x.ref === 'IE00B4L5Y983')).toBeUndefined();
  });

  it('flags single-stock concentration over the cap', () => {
    const a = analyzePortfolio(
      [
        pos({ isin: 'US67066G1040', assetType: 'stock', currentValue: 400 }),
        pos({ isin: 'US0378331005', assetType: 'stock', currentValue: 100 }),
        pos({ isin: 'IE00B4L5Y983', assetType: 'etf', currentValue: 500 }),
      ],
      OPTS,
    );
    expect(a.singleStockPct).toBeCloseTo(50, 5);
    const f = a.flags.find((x) => x.kind === 'single-stock');
    expect(f).toBeDefined();
    expect(f!.overByEur).toBeCloseTo(200, 5);
  });

  it('sorts flags by overByEur descending', () => {
    const a = analyzePortfolio(
      [
        pos({ isin: 'IE00B53SZB19', currentValue: 500, targetPercentage: 10 }),
        pos({ isin: 'IE00B4L5Y983', currentValue: 500 }),
      ],
      OPTS,
    );
    const headrooms = a.flags.map((f) => f.overByEur);
    const sorted = [...headrooms].sort((x, y) => y - x);
    expect(headrooms).toEqual(sorted);
  });

  it('does NOT flag a broad-market sector even above the cap', () => {
    const a = analyzePortfolio(
      [
        pos({ isin: 'IE00B4L5Y983', currentValue: 800 }), // Global Equity 80% (broad)
        pos({ isin: 'IE00B53SZB19', currentValue: 200 }), // US Tech 20% (narrow, under cap)
      ],
      OPTS,
    );
    expect(a.flags.find((f) => f.kind === 'sector' && f.ref === 'Global Equity')).toBeUndefined();
  });

  it('still flags a narrow sector above the cap', () => {
    const a = analyzePortfolio(
      [
        pos({ isin: 'IE00B53SZB19', currentValue: 500 }), // US Tech 50% (narrow)
        pos({ isin: 'IE00B4L5Y983', currentValue: 500 }), // Global Equity 50% (broad, exempt)
      ],
      OPTS,
    );
    expect(a.flags.find((f) => f.kind === 'sector' && f.ref === 'US Tech')).toBeDefined();
    expect(a.flags.find((f) => f.kind === 'sector' && f.ref === 'Global Equity')).toBeUndefined();
  });
});
