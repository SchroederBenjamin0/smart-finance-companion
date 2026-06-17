# Portfolio-aware Advisor + Diversification + Trim-to-Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the advisor portfolio-aware: deterministic sector/diversification analysis with concentration flags, surfaced as a standing Investments panel and fed to the LLM, which may propose bounded trim-to-target sells alongside buys.

**Architecture:** A pure `portfolio-analysis` module computes sector weights and concentration flags (each with a `overByEur` trim headroom). The advisor passes this analysis to Claude; Claude returns buys (TR-universe only) + trims (held positions only), and `normalizeAndFilter` hard-clamps trims to flagged overweights and their headroom. UI reuses one `SectorBreakdownCard` on the Investments tab and in the income AdvisorSheet.

**Tech Stack:** TypeScript (strict), React 18, Tailwind, lucide-react, Vitest, Anthropic Claude API.

**Spec:** `docs/superpowers/specs/2026-06-16-portfolio-aware-advisor-design.md`

---

## File Structure

- Create `src/modules/portfolio-analysis/index.ts` — pure analysis (sectors, flags, headroom). One responsibility.
- Modify `src/services/advisor.ts` — feed analysis to LLM, parse/clamp `buy`/`trim` actions.
- Create `src/components/feature/investments/SectorBreakdownCard.tsx` — shared diversification visual.
- Modify `src/views/Investments.tsx` — standing diversification panel.
- Modify `src/components/feature/income/AdvisorSheet.tsx` — compute analysis, pass to advisor, render trims.
- Modify `src/components/feature/advisor/RecommendationCard.tsx` — `action` (buy/trim) styling.
- Modify `CLAUDE.md`, `specs/llm-prompts.md` — guardrail precision.
- Create `tests/modules/portfolio-analysis.test.ts`; extend `tests/services/advisor.test.ts`.

Order: Task 1 (analysis) → Task 2 (advisor) → Tasks 3-5 (UI) → Task 6 (docs) → Task 7 (verify).

---

## Task 1: portfolio-analysis module

**Files:**
- Create: `src/modules/portfolio-analysis/index.ts`
- Test: `tests/modules/portfolio-analysis.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
        pos({ isin: 'IE00B4L5Y983', currentValue: 600 }), // Global Equity
        pos({ isin: 'IE00B53SZB19', currentValue: 300 }), // US Tech (Nasdaq)
        pos({ isin: 'XX0000000000', currentValue: 100 }), // unknown -> Sonstige
      ],
      OPTS,
    );
    expect(a.totalValue).toBe(1000);
    const byName = Object.fromEntries(a.sectors.map((s) => [s.sector, s.pct]));
    expect(byName['Global Equity']).toBeCloseTo(60, 5);
    expect(byName['US Tech']).toBeCloseTo(30, 5);
    expect(byName['Sonstige']).toBeCloseTo(10, 5);
    // sorted by value desc
    expect(a.sectors[0]!.sector).toBe('Global Equity');
  });

  it('flags a sector over the cap with the euro headroom', () => {
    const a = analyzePortfolio(
      [
        pos({ isin: 'IE00B53SZB19', currentValue: 500 }), // US Tech 50%
        pos({ isin: 'IE00B4L5Y983', currentValue: 500 }), // Global Equity 50%
      ],
      OPTS,
    );
    const f = a.flags.find((x) => x.kind === 'sector' && x.ref === 'US Tech');
    expect(f).toBeDefined();
    expect(f!.pct).toBeCloseTo(50, 5);
    expect(f!.capPct).toBe(35);
    expect(f!.overByEur).toBeCloseTo(150, 5); // (50-35)% of 1000
  });

  it('flags a single position over its target + tolerance only when target > 0', () => {
    const a = analyzePortfolio(
      [
        pos({ isin: 'US67066G1040', name: 'NVIDIA', currentValue: 300, targetPercentage: 10 }), // 30% vs target 10%
        pos({ isin: 'IE00B4L5Y983', currentValue: 700, targetPercentage: 0 }), // no target -> never flagged as position
      ],
      OPTS,
    );
    const f = a.flags.find((x) => x.kind === 'position' && x.ref === 'US67066G1040');
    expect(f).toBeDefined();
    expect(f!.capPct).toBe(10);
    expect(f!.overByEur).toBeCloseTo(200, 5); // (30-10)% of 1000
    expect(a.flags.find((x) => x.kind === 'position' && x.ref === 'IE00B4L5Y983')).toBeUndefined();
  });

  it('flags single-stock concentration over the cap', () => {
    const a = analyzePortfolio(
      [
        pos({ isin: 'US67066G1040', assetType: 'stock', currentValue: 400 }), // stock
        pos({ isin: 'US0378331005', assetType: 'stock', currentValue: 100 }), // stock
        pos({ isin: 'IE00B4L5Y983', assetType: 'etf', currentValue: 500 }),
      ],
      OPTS,
    );
    expect(a.singleStockPct).toBeCloseTo(50, 5);
    const f = a.flags.find((x) => x.kind === 'single-stock');
    expect(f).toBeDefined();
    expect(f!.overByEur).toBeCloseTo(200, 5); // (50-30)% of 1000
  });

  it('sorts flags by overByEur descending', () => {
    const a = analyzePortfolio(
      [
        pos({ isin: 'IE00B53SZB19', currentValue: 500, targetPercentage: 10 }), // US Tech sector + position over target
        pos({ isin: 'IE00B4L5Y983', currentValue: 500 }),
      ],
      OPTS,
    );
    const headrooms = a.flags.map((f) => f.overByEur);
    const sorted = [...headrooms].sort((x, y) => y - x);
    expect(headrooms).toEqual(sorted);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/modules/portfolio-analysis.test.ts`
Expected: FAIL — cannot resolve `@/modules/portfolio-analysis`.

- [ ] **Step 3: Implement the module**

Create `src/modules/portfolio-analysis/index.ts`:

```ts
import type { InvestmentPosition } from '@/db/types';
import { findByIsin } from '@/data/tr-universe';

export const SECTOR_CAP_PCT = 35;
export const SINGLE_STOCK_CAP_PCT = 30;

export interface SectorSlice {
  sector: string;
  valueEur: number;
  pct: number;
}

export type ConcentrationKind = 'sector' | 'position' | 'single-stock';

export interface ConcentrationFlag {
  kind: ConcentrationKind;
  ref: string; // isin (position) | sector name (sector) | '' (single-stock)
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

/** Sector for a position via the TR universe; 'Sonstige' when unknown. */
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

  // Sector aggregation
  const sectorValue = new Map<string, number>();
  for (const p of positions) {
    const sec = sectorOf(p);
    sectorValue.set(sec, (sectorValue.get(sec) ?? 0) + p.currentValue);
  }
  const sectors: SectorSlice[] = Array.from(sectorValue.entries())
    .map(([sector, valueEur]) => ({ sector, valueEur, pct: (valueEur / totalValue) * 100 }))
    .sort((a, b) => b.valueEur - a.valueEur);

  const singleStockValue = positions
    .filter(isStock)
    .reduce((s, p) => s + p.currentValue, 0);
  const singleStockPct = (singleStockValue / totalValue) * 100;

  const flags: ConcentrationFlag[] = [];

  // Sector over cap
  for (const s of sectors) {
    if (s.pct > opts.sectorCapPct) {
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

  // Position over target + tolerance (only when a target is set)
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

  // Single-stock concentration
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/modules/portfolio-analysis.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/portfolio-analysis/index.ts tests/modules/portfolio-analysis.test.ts
git commit -m "feat(advisor): add deterministic portfolio-analysis module"
```

---

## Task 2: advisor — analysis input, buy/trim actions, clamping

**Files:**
- Modify: `src/services/advisor.ts`
- Test: `tests/services/advisor.test.ts` (extend; keep existing tests passing)

- [ ] **Step 1: Write failing tests (append to advisor.test.ts)**

```ts
import { analyzePortfolio, SECTOR_CAP_PCT, SINGLE_STOCK_CAP_PCT } from '@/modules/portfolio-analysis';
import type { InvestmentPosition } from '@/db/types';

function position(p: Partial<InvestmentPosition>): InvestmentPosition {
  return {
    id: p.id ?? 'p', ticker: p.ticker ?? '', isin: p.isin ?? '', name: p.name ?? 'X',
    assetType: p.assetType ?? 'stock', totalInvested: 0, shares: 1,
    currentValue: p.currentValue ?? 0, lastSyncedPrice: '2026-06-01',
    targetPercentage: p.targetPercentage ?? 0,
  };
}

describe('advisor trim handling', () => {
  const portfolio = [
    position({ isin: 'US67066G1040', name: 'NVIDIA', assetType: 'stock', currentValue: 500 }), // US Tech 50%
    position({ isin: 'IE00B4L5Y983', name: 'World', assetType: 'etf', currentValue: 500 }),
  ];
  const analysis = analyzePortfolio(portfolio, {
    sectorCapPct: SECTOR_CAP_PCT, singleStockCapPct: SINGLE_STOCK_CAP_PCT, driftTolerancePp: 5,
  });

  it('clamps a trim to the flagged overweight headroom and keeps it on a held position', () => {
    const raw = {
      allocations: [
        { action: 'trim', isin: 'US67066G1040', amount_eur: 9999, reason: 'Tech über Cap' },
      ],
      summary: 's',
    };
    const r = normalizeAndFilter(raw, { portfolio, analysis });
    expect(r.allocations).toHaveLength(1);
    expect(r.allocations[0]!.action).toBe('trim');
    // US Tech sector headroom = (50-35)% of 1000 = 150; single-stock headroom = (50-30)% of 1000 = 200
    // max justifying headroom = 200 → clamp 9999 down to 200
    expect(r.allocations[0]!.amountEur).toBeCloseTo(200, 5);
  });

  it('drops a trim for a position that is not held', () => {
    const raw = { allocations: [{ action: 'trim', isin: 'IE00BK5BQT80', amount_eur: 50, reason: 'x' }], summary: 's' };
    const r = normalizeAndFilter(raw, { portfolio, analysis });
    expect(r.allocations).toHaveLength(0);
  });

  it('drops a trim for a held position with no overweight flag', () => {
    const raw = { allocations: [{ action: 'trim', isin: 'IE00B4L5Y983', amount_eur: 50, reason: 'x' }], summary: 's' };
    const r = normalizeAndFilter(raw, { portfolio, analysis });
    expect(r.allocations).toHaveLength(0);
  });

  it('treats a missing action as a buy and still enforces the TR universe', () => {
    const raw = { allocations: [{ isin: 'IE00B4L5Y983', amount_eur: 100, reason: 'buy' }], summary: 's' };
    const r = normalizeAndFilter(raw, { portfolio, analysis });
    expect(r.allocations).toHaveLength(1);
    expect(r.allocations[0]!.action).toBe('buy');
  });

  it('parses the diversification note', () => {
    const raw = { allocations: [], diversification: 'Tech überdurchschnittlich.', summary: 's' };
    const r = normalizeAndFilter(raw, { portfolio, analysis });
    expect(r.diversification).toBe('Tech überdurchschnittlich.');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/services/advisor.test.ts`
Expected: FAIL — `action`/`diversification` undefined, 2nd arg ignored.

- [ ] **Step 3: Update advisor.ts types + signature + clamping**

In `src/services/advisor.ts`:

(a) Add imports:
```ts
import type { InvestmentPosition } from '@/db/types';
import { analyzePortfolio, type PortfolioAnalysis, type ConcentrationFlag, sectorOf } from '@/modules/portfolio-analysis';
```
(`InvestmentPosition` is already imported; add the analysis imports.)

(b) Extend types:
```ts
export type AdvisorAction = 'buy' | 'trim';

export interface AdvisorAllocation {
  action: AdvisorAction;
  isin: string;
  ticker: string;
  name: string;
  amountEur: number;
  reason: string;
}

export interface AdvisorRecommendation {
  allocations: AdvisorAllocation[];
  totalEur: number;       // sum of BUY amounts (new Sparplan total)
  diversification: string | null;
  driftWarning: string | null;
  summary: string;
}
```

(c) Replace `normalizeAndFilter` with the action-aware, clamped version:
```ts
export function normalizeAndFilter(
  parsed: Record<string, unknown>,
  ctx?: { portfolio?: InvestmentPosition[]; analysis?: PortfolioAnalysis },
): AdvisorRecommendation {
  const portfolio = ctx?.portfolio ?? [];
  const flags = ctx?.analysis?.flags ?? [];

  const rawAllocations = Array.isArray(parsed['allocations'])
    ? (parsed['allocations'] as Array<Record<string, unknown>>)
    : [];

  const allocations: AdvisorAllocation[] = [];
  for (const a of rawAllocations) {
    const action: AdvisorAction = a['action'] === 'trim' ? 'trim' : 'buy';
    const isin = typeof a['isin'] === 'string' ? a['isin'] : '';
    const amount = Number(a['amount_eur'] ?? 0);
    const reason = typeof a['reason'] === 'string' ? a['reason'] : '';
    if (!Number.isFinite(amount) || amount <= 0) continue;

    if (action === 'buy') {
      const match = findByIsin(isin);
      if (!match) continue;
      allocations.push({
        action: 'buy', isin, ticker: match.tickerYahoo, name: match.displayName,
        amountEur: amount, reason,
      });
    } else {
      const held = portfolio.find((p) => p.isin.toUpperCase() === isin.toUpperCase());
      if (!held) continue;
      const headroom = trimHeadroom(held, flags);
      if (headroom <= 0) continue;
      allocations.push({
        action: 'trim', isin: held.isin, ticker: held.ticker, name: held.name,
        amountEur: Math.min(amount, headroom), reason,
      });
    }
  }

  const totalEur = allocations
    .filter((a) => a.action === 'buy')
    .reduce((s, a) => s + a.amountEur, 0);

  const diversification =
    typeof parsed['diversification'] === 'string' ? parsed['diversification'] : null;
  const driftWarning =
    typeof parsed['drift_warning'] === 'string' ? parsed['drift_warning'] : null;
  const summary =
    typeof parsed['summary'] === 'string' ? parsed['summary'] : 'Empfehlung erstellt.';

  return { allocations, totalEur, diversification, driftWarning, summary };
}

/** Max euro a held position may be trimmed: the largest justifying overweight flag. */
function trimHeadroom(
  position: InvestmentPosition,
  flags: ConcentrationFlag[],
): number {
  const sector = sectorOf(position);
  let headroom = 0;
  for (const f of flags) {
    const justifies =
      (f.kind === 'position' && f.ref.toUpperCase() === position.isin.toUpperCase()) ||
      (f.kind === 'sector' && f.ref === sector) ||
      (f.kind === 'single-stock' && isTrimmableStock(position));
    if (justifies) headroom = Math.max(headroom, f.overByEur);
  }
  return headroom;
}

function isTrimmableStock(position: InvestmentPosition): boolean {
  const u = findByIsin(position.isin);
  return u ? u.type === 'stock' : position.assetType === 'stock';
}
```

(d) Update the system prompt — replace rule 4 and rule 8, add diversification + the new schema. Change `BASE_SYSTEM_PROMPT` rules block to:
```
Deine Regeln (NIEMALS brechen):
1. Niemals Markt-Timing oder kurzfristige Trades empfehlen
2. Niemals Krypto vorschlagen
3. Einzelaktien nur sparsam, max 30% der Empfehlungs-Summe, Bevorzugung von ETFs
4. Verkaufs-Vorschläge ("trim") NUR für Positionen/Sektoren, die in der gelieferten
   Analyse als Übergewicht markiert sind, und ausschließlich Richtung Ziel-Allokation.
   Der Trim-Betrag darf den gelieferten Spielraum NICHT überschreiten. Niemals etwas
   verkaufen, weil ein Wert "schlecht" oder ein anderer "besser" erscheint.
5. Neue Käufe bevorzugt in unter dem Ziel liegende Bausteine lenken (Diversifikation).
6. Begründungen kurz halten (max 2 Sätze pro Position)
7. Auf Deutsch antworten
8. Niemals Garantien aussprechen ("dieser ETF wird steigen")
```
And change the response-format block to include `action` and `diversification`:
```
Antwort-Format (strikt JSON, kein Markdown-Code-Block):
{
  "allocations": [
    { "action": "buy",  "isin": "IE00B4L5Y983", "amount_eur": 230, "reason": "..." },
    { "action": "trim", "isin": "<gehaltene ISIN>", "amount_eur": 120, "reason": "..." }
  ],
  "total_eur": 470,
  "diversification": "1-2 Sätze zur Sektor-/Konzentrations-Lage",
  "drift_warning": null,
  "summary": "Kurze Hauptaussage (1-2 Sätze)"
}
```

(e) `buildUserMessage`: add analysis. Change its signature to also take `analysis: PortfolioAnalysis` and append after the portfolio block:
```ts
  const sectorLines = analysis.sectors
    .map((s) => `- ${s.sector}: ${s.pct.toFixed(0)}% (${s.valueEur.toFixed(0)} EUR)`)
    .join('\n');
  const flagLines = analysis.flags.length
    ? analysis.flags
        .map((f) => `- Übergewicht ${f.label}: ${f.pct.toFixed(0)}% (Ziel/Cap ${f.capPct}%, Trim-Spielraum bis ${f.overByEur.toFixed(0)} EUR)`)
        .join('\n')
    : '(keine Übergewichte)';
```
and include in the returned message:
```
Sektor-Verteilung:
${analysis.sectors.length ? sectorLines : '(leer)'}
Einzelaktien-Anteil: ${analysis.singleStockPct.toFixed(0)}%

Übergewichte (nur diese dürfen getrimmt werden):
${flagLines}
```

(f) `recommendAllocation` and `runAdvisor`: thread `analysis` through. Change `recommendAllocation` input to `{ availableEur; portfolio; target; analysis }`, pass `analysis` into `buildUserMessage`, and call `normalizeAndFilter(parsed, { portfolio, analysis })` inside `runAdvisor` (thread `portfolio`+`analysis` as params). Keep the empty-availableEur early return but set `diversification: null`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/advisor.test.ts`
Expected: PASS — existing tests still green (they call `normalizeAndFilter(raw)` with no ctx → trims dropped, buys unchanged), new trim tests pass.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -b --noEmit` (expect clean — callers updated in Task 5; if AdvisorSheet errors here, that's expected and fixed in Task 5, but the advisor.ts file itself must compile — verify by `npx vitest run` which transpiles it).
```bash
git add src/services/advisor.ts tests/services/advisor.test.ts
git commit -m "feat(advisor): portfolio-aware prompt + bounded buy/trim actions"
```
Note: full `tsc` may fail until Task 5 updates `AdvisorSheet`'s `recommendAllocation` call. Commit anyway; Task 5 closes the loop. (If you prefer a green tree per commit, do Task 5 before committing Task 2 — but keep them as separate commits.)

---

## Task 3: SectorBreakdownCard component

**Files:**
- Create: `src/components/feature/investments/SectorBreakdownCard.tsx`

- [ ] **Step 1: Implement the component**

```tsx
import { TriangleAlert } from 'lucide-react';
import type { PortfolioAnalysis } from '@/modules/portfolio-analysis';

const SECTOR_COLORS = [
  '#0a4d2e', '#16a34a', '#10b981', '#22c55e', '#65a30d', '#0e7490',
  '#7c3aed', '#b45309', '#9aa6af',
];

interface Props {
  analysis: PortfolioAnalysis;
  /** compact = smaller variant for the AdvisorSheet */
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit` (this component compiles independently).
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/feature/investments/SectorBreakdownCard.tsx
git commit -m "feat(investments): add SectorBreakdownCard diversification visual"
```

---

## Task 4: standing Diversifikation panel on Investments tab

**Files:**
- Modify: `src/views/Investments.tsx`

- [ ] **Step 1: Wire the panel**

Add imports near the top of `src/views/Investments.tsx`:
```ts
import { useMemo } from 'react'; // already imported alongside others — ensure useMemo present
import { analyzePortfolio, SECTOR_CAP_PCT, SINGLE_STOCK_CAP_PCT } from '@/modules/portfolio-analysis';
import { SectorBreakdownCard } from '@/components/feature/investments/SectorBreakdownCard';
```
(`useMemo` is already imported in this file; do not duplicate.)

Inside the component, after the `totals` useMemo, add:
```ts
  const analysis = useMemo(
    () => analyzePortfolio(positions, {
      sectorCapPct: SECTOR_CAP_PCT,
      singleStockCapPct: SINGLE_STOCK_CAP_PCT,
      driftTolerancePp: tolerance,
    }),
    [positions, tolerance],
  );
```
(`tolerance` is the existing drift-tolerance state in this view.)

Render the panel after the holdings section and before the news section (i.e., after the `{positions.length > 0 && (<>… Holdings …</>)}` block):
```tsx
        {positions.length > 0 && (
          <div className="mt-6">
            <h2 className="text-label font-semibold uppercase tracking-wider text-ink-subtle">
              Diversifikation
            </h2>
            <div className="mt-3">
              <SectorBreakdownCard analysis={analysis} />
            </div>
          </div>
        )}
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc -b --noEmit && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/views/Investments.tsx
git commit -m "feat(investments): standing diversification panel"
```

---

## Task 5: AdvisorSheet — analysis input + render buy/trim distinctly

**Files:**
- Modify: `src/components/feature/income/AdvisorSheet.tsx`
- Modify: `src/components/feature/advisor/RecommendationCard.tsx`

- [ ] **Step 1: RecommendationCard — add action styling**

In `RecommendationCard.tsx`, extend its `data` prop with `action?: 'buy' | 'trim'` (default `'buy'`). When `action === 'trim'`, render the amount/label in amber with a "Reduzieren"/"−" treatment instead of the buy styling. Concretely: add `action` to the data interface; compute `const isTrim = data.action === 'trim';`; prefix the euro amount with `isTrim ? '−' : '+'` is misleading — instead show a small amber chip labeled `Reduzieren` next to the name when `isTrim`, and keep the euro amount neutral. Read the current file first and follow its existing layout; do not restructure.

- [ ] **Step 2: AdvisorSheet — compute analysis, pass it, render trims**

In `AdvisorSheet.tsx`:

Add imports:
```ts
import { analyzePortfolio, SECTOR_CAP_PCT, SINGLE_STOCK_CAP_PCT } from '@/modules/portfolio-analysis';
import { SectorBreakdownCard } from '@/components/feature/investments/SectorBreakdownCard';
```

In the effect, after `setPositions(portfolio);`, compute analysis and pass it:
```ts
      const analysis = analyzePortfolio(portfolio, {
        sectorCapPct: SECTOR_CAP_PCT,
        singleStockCapPct: SINGLE_STOCK_CAP_PCT,
        driftTolerancePp: 5,
      });
      // ... inside the recommendAllocation call:
      const r = await recommendAllocation({
        availableEur: investmentAmount,
        portfolio,
        target: DEFAULT_ALLOCATION_TARGET,
        analysis,
      });
```
Store `analysis` in state (`const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null)`; import the type) so the ready view can render the compact card; `setAnalysis(analysis)` before the call.

In the `stage === 'ready'` block: after the Claude summary box, render the diversification context and split the allocations:
```tsx
          {analysis && analysis.flags.length > 0 && (
            <SectorBreakdownCard analysis={analysis} compact />
          )}
          {rec.diversification && (
            <div className="rounded-control bg-paper px-4 py-3 text-meta text-ink-muted">
              {rec.diversification}
            </div>
          )}

          {rec.allocations.filter((a) => a.action === 'buy').length > 0 && (
            <div className="space-y-2">
              <div className="text-caption font-bold uppercase tracking-wider text-ink-subtle">Käufe</div>
              {rec.allocations.filter((a) => a.action === 'buy').map((a, i) => (
                <RecommendationCard
                  key={`buy-${a.isin || a.ticker}-${i}`}
                  data={{ action: 'buy', isin: resolveIsin(a), ticker: a.ticker, name: a.name, amountEur: a.amountEur, reason: a.reason }}
                />
              ))}
            </div>
          )}
          {rec.allocations.filter((a) => a.action === 'trim').length > 0 && (
            <div className="space-y-2">
              <div className="text-caption font-bold uppercase tracking-wider text-amber-700">Rebalancing — Reduzieren</div>
              {rec.allocations.filter((a) => a.action === 'trim').map((a, i) => (
                <RecommendationCard
                  key={`trim-${a.isin || a.ticker}-${i}`}
                  data={{ action: 'trim', isin: resolveIsin(a), ticker: a.ticker, name: a.name, amountEur: a.amountEur, reason: a.reason }}
                />
              ))}
            </div>
          )}
```
Remove the old single `rec.allocations.map(...)` block (replaced by the split above). Keep the `Summe` footer but base it on `rec.totalEur` (buys only — already so).

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc -b --noEmit && npm run build`
Expected: clean (this closes the `recommendAllocation` signature change from Task 2).

- [ ] **Step 4: Commit**

```bash
git add src/components/feature/income/AdvisorSheet.tsx src/components/feature/advisor/RecommendationCard.tsx
git commit -m "feat(advisor): surface diversification + trim suggestions in income sheet"
```

---

## Task 6: guardrail docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `specs/llm-prompts.md` (if it documents the advisor sell rule)

- [ ] **Step 1: Update CLAUDE.md**

In the "Was du NIEMALS tust" list, change the blanket no-sells stance to reflect the new policy. Replace the line about investment recommendations / auto-execute with precise wording:
- Keep: "Auto-Execute-Funktionen für Trades vorschlagen" (still forbidden).
- Keep: "Investment-Empfehlungen mit Markt-Timing implementieren" (still forbidden).
- Add a clarifying note under the advisor context (or near these lines): "Ausnahme Verkäufe: **Trim-to-Target-Rebalancing** ist erlaubt — Verkaufs-*Vorschläge* nur, um Positionen/Sektoren über ihrem Ziel auf die Ziel-Allokation zurückzuführen (deterministisch gekappt). Kein meinungsbasiertes Stock-Picking, kein Markt-Timing, kein Auto-Execute."

- [ ] **Step 2: Update specs/llm-prompts.md**

Read it; if it states "keine Verkaufs-Empfehlungen", update that section to match the advisor's new rule 4 (trim-to-target only, bounded by computed headroom). If the advisor prompt isn't documented there, skip with a note.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md specs/llm-prompts.md
git commit -m "docs: allow trim-to-target rebalancing in advisor guardrails"
```

---

## Task 7: full verification + visual spot-check

**Files:** none

- [ ] **Step 1: Tests**

Run: `npx vitest run`
Expected: all pass (portfolio-analysis + advisor trim tests added; nothing broken).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc -b --noEmit && npm run build`
Expected: both clean.

- [ ] **Step 3: Visual spot-check**

`npm run dev`, open the app: Investments tab shows a "Diversifikation" panel with the sector bar + any amber over-concentration flags; entering income opens the AdvisorSheet which (with a valid Anthropic key) shows buys and, if the portfolio has a flagged overweight, a "Reduzieren" section. Verify trim amounts never exceed the flagged headroom shown in the panel.

- [ ] **Step 4: Final commit (if visual tweaks needed)**

```bash
git add -A
git commit -m "polish(advisor): visual fine-tuning"
```

---

## Self-Review (performed)

- **Spec coverage:** portfolio-awareness (Task 2 prompt) ✓; diversification analysis (Task 1 + 3 + 4) ✓; trim-to-target with both triggers (Task 1 flags: sector + position + single-stock; Task 2 clamping) ✓; both placements (Task 4 Investments + Task 5 AdvisorSheet) ✓; guardrail precision (Task 6) ✓; deterministic spine + LLM narration (Task 1 deterministic, Task 2 LLM bounded) ✓; tests (Task 1 + Task 2) ✓.
- **Placeholder scan:** no TBD/TODO; all code blocks complete; the one "read the current file" instruction (RecommendationCard, Task 5 Step 1) is because its exact JSX must be followed — the required change (add `action`, amber trim styling) is fully specified.
- **Type consistency:** `analyzePortfolio`/`AnalysisOptions`/`PortfolioAnalysis`/`ConcentrationFlag`/`sectorOf` defined in Task 1 are used with the same signatures in Tasks 2/4/5; `AdvisorAllocation.action` and `AdvisorRecommendation.diversification` defined in Task 2 are consumed in Task 5; `normalizeAndFilter(parsed, ctx?)` signature is backward-compatible so existing advisor tests still pass.
- **Ordering caveat:** Task 2 may leave `tsc` red until Task 5 updates the `recommendAllocation` caller; flagged in Task 2 Step 5. Vitest (transpile-only) stays green throughout.
