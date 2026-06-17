# Portfolio-aware Advisor + Diversification Analysis + Trim-to-Target — Design-Spec

**Datum:** 2026-06-16
**Status:** Freigegeben (Brainstorming abgeschlossen)
**Architektur-Entscheidung:** Deterministisches Analyse-Modul als verlässliches Rückgrat + LLM nur für Priorisierung/Wording innerhalb berechneter Grenzen.

## Ziel

Beim Einkommens-Eintrag (und als Dauer-Panel auf dem Investments-Tab) soll der
Advisor das **bestehende Portfolio kennen**, die **Sektor-/Diversifikations-
Verteilung** bewerten (Überkonzentration erkennen) und **Trim-to-Target-
Verkäufe** vorschlagen dürfen — diszipliniertes Rebalancing Richtung Ziel,
**kein** spekulatives Stock-Picking, **kein** Markt-Timing, **kein** Auto-Execute.

## Guardrail-Änderung (bewusst)

`CLAUDE.md` und `specs/llm-prompts.md` verbieten aktuell Verkaufs-Empfehlungen
generell. Diese Regel wird präzisiert (Owner-Entscheidung, Single-User-App):

> Verboten bleiben: meinungsbasiertes Stock-Picking („X ist schlecht / Y ist
> besser"), Markt-Timing, Krypto, Auto-Execute/Trade-Ausführung.
> **Erlaubt** wird: **Trim-to-Target-Rebalancing** — Verkaufs-*Vorschläge* nur,
> um eine über ihrem Ziel liegende Position oder einen über dem Cap liegenden
> Sektor auf die Ziel-Allokation zurückzuführen, betragsmäßig gekappt auf den
> deterministisch berechneten Überschuss.

## Komponenten

### 1. `src/modules/portfolio-analysis/index.ts` (pure, getestet)

Deterministische Analyse — keine LLM-Beteiligung, keine IO.

```ts
export interface SectorSlice { sector: string; valueEur: number; pct: number; }

export type ConcentrationKind = 'sector' | 'position' | 'single-stock';

export interface ConcentrationFlag {
  kind: ConcentrationKind;
  /** isin for 'position', sector name for 'sector', '' for 'single-stock'. */
  ref: string;
  label: string;       // z.B. "US Tech" | "NVIDIA Corporation" | "Einzelaktien"
  pct: number;         // aktueller Anteil am Portfolio (0-100)
  capPct: number;      // überschrittener Schwellwert/Zielanteil
  overByEur: number;   // Marktwert über der Schwelle = max. Trim-Spielraum
}

export interface PortfolioAnalysis {
  totalValue: number;
  sectors: SectorSlice[];      // absteigend nach valueEur
  singleStockPct: number;      // Summe type==='stock'
  flags: ConcentrationFlag[];  // sortiert: höchste overByEur zuerst
}

export interface AnalysisOptions {
  sectorCapPct: number;        // Default SECTOR_CAP_PCT = 35
  singleStockCapPct: number;   // Default SINGLE_STOCK_CAP_PCT = 30
  driftTolerancePp: number;    // aus driftToleranceGlobal (Default 5)
}

export const SECTOR_CAP_PCT = 35;
export const SINGLE_STOCK_CAP_PCT = 30;

export function analyzePortfolio(
  positions: InvestmentPosition[],
  opts: AnalysisOptions,
): PortfolioAnalysis;

/** Sektor eines Positions-ISIN via TR-Universum, Fallback 'Sonstige'. */
export function sectorOf(position: InvestmentPosition): string;
```

Regeln:
- `totalValue = Σ currentValue`. Bei 0 → leere `sectors`, `flags: []`.
- Sektor je Position: `findByIsin(position.isin)?.sector ?? 'Sonstige'`.
- `sectors`: gruppiere `currentValue` nach Sektor, `pct = value/total*100`, runde Anzeige im UI (intern voll).
- Flag `sector`: `pct > sectorCapPct` → `overByEur = (pct - sectorCapPct)/100 * total`, `capPct = sectorCapPct`.
- Flag `position`: nur wenn `targetPercentage > 0` und `currentPct > targetPercentage + driftTolerancePp`
  → `overByEur = (currentPct - targetPercentage)/100 * total`, `capPct = targetPercentage`.
- Flag `single-stock`: `singleStockPct > singleStockCapPct`
  → `overByEur = (singleStockPct - singleStockCapPct)/100 * total`, `capPct = singleStockCapPct`.
- `flags` absteigend nach `overByEur`.

### 2. `src/services/advisor.ts` (erweitern)

- `recommendAllocation(input)` bekommt zusätzlich `analysis: PortfolioAnalysis`
  (vom Aufrufer berechnet) — oder berechnet sie selbst aus `portfolio`+opts.
  Entscheidung: Aufrufer übergibt `analysis` (einmal berechnet, auch fürs UI genutzt).
- `buildUserMessage` ergänzt: Sektor-Zeilen, `singleStockPct`, und die Flags als
  Liste `Übergewicht: <label> <pct>% (Ziel/Cap <capPct>%, Spielraum bis <overByEur> €)`.
- System-Prompt-Ergänzung (zur bestehenden Liste):
  - Regel 4 (war „nur Käufe") wird ersetzt: „Verkaufs-Vorschläge NUR als `trim`
    für Positionen/Sektoren, die in der gelieferten Analyse als Übergewicht
    markiert sind, und nur Richtung Ziel. Trim-Betrag ≤ gelieferter Spielraum.
    Niemals trimmen, weil ein Wert ‚schlecht'/‚besser' erscheint."
  - Neue Regel: „Lenke neue Käufe bevorzugt in unter dem Ziel liegende Bausteine."
- Antwort-Schema erweitert:
  ```json
  {
    "allocations": [
      { "action": "buy",  "isin": "...", "amount_eur": 230, "reason": "..." },
      { "action": "trim", "isin": "...", "amount_eur": 120, "reason": "..." }
    ],
    "total_eur": 470,
    "diversification": "1-2 Sätze zur Verteilung/Konzentration",
    "drift_warning": null,
    "summary": "..."
  }
  ```
- `AdvisorAllocation` bekommt `action: 'buy' | 'trim'`.
- `AdvisorRecommendation` bekommt `diversification: string | null` und (durchgereicht)
  die `analysis`.
- `normalizeAndFilter` (harte Guardrail, getestet):
  - `buy`: ISIN muss in TR-Universum sein (wie bisher); Name/Ticker aus Whitelist überschrieben.
  - `trim`: ISIN muss eine **aktuell gehaltene Position** sein (Match gegen `portfolio`,
    nicht TR-Universum); `amount_eur` wird auf den zugehörigen `overByEur`-Spielraum
    **geklemmt** (min). Gibt es keinen passenden Übergewicht-Flag für die Position
    bzw. deren Sektor → Trim **verwerfen**. Name aus der Position.
  - `action` fehlend/unbekannt → als `buy` behandeln (rückwärtskompatibel).
  - Da `normalizeAndFilter` jetzt `portfolio`+`analysis` braucht: Signatur erweitern.

### 3. UI

- `src/components/feature/investments/SectorBreakdownCard.tsx` (geteilt):
  - Gestapelter horizontaler Balken (einfache `div`s mit `chart-colors`), Legende
    mit Sektor · % · €; übergewichtete Sektoren amber markiert.
  - Zeigt Einzelaktien-Anteil + Warnungen aus `flags` (Text wie „US Tech 42% — über 35%").
  - Reine Props: `analysis: PortfolioAnalysis`. Kein State, kein LLM.
- `src/views/Investments.tsx`: Dauer-Panel „Diversifikation" — `analyzePortfolio(positions, opts)`
  (opts.driftTolerancePp aus dem schon geladenen `tolerance`-State) → `<SectorBreakdownCard/>`.
- `src/components/feature/income/AdvisorSheet.tsx`:
  - Vor dem LLM-Call `analyzePortfolio` rechnen, an `recommendAllocation` übergeben.
  - Kompakte Diversifikations-Zusammenfassung (kleine Variante der Card oder die `diversification`-Zeile).
  - Allocations nach `action` rendern: `buy` grün (wie bisher), `trim` amber mit „Reduzieren"-Label.
- `src/components/feature/advisor/RecommendationCard.tsx`: `action`-Prop für Buy/Trim-Styling.

### 4. Konfiguration / Konstanten

- `SECTOR_CAP_PCT = 35`, `SINGLE_STOCK_CAP_PCT = 30` als Konstanten im Modul
  (später leicht als Settings-Slider, jetzt YAGNI).
- Drift nutzt den bestehenden `driftToleranceGlobal`-Config-Wert.

## Datenfluss

Einkommen → AdvisorSheet → `positionsRepo.findAll` → `analyzePortfolio` →
`recommendAllocation({ availableEur, portfolio, target, analysis })` → LLM
(Käufe + gekappte Trims + Narration) → `normalizeAndFilter` clampt → Render
(Buy/Trim getrennt + Diversifikation).
Investments-Tab → `analyzePortfolio` → `SectorBreakdownCard` (kein LLM).

## Fehlerbehandlung

- LLM-Fehler/kein Key → das deterministische Diversifikations-Panel funktioniert
  trotzdem; das Sheet zeigt den Fehler wie bisher.
- Positionen ohne Sektor → `Sonstige`-Bucket, kein Crash.
- Leeres Portfolio → keine Flags, freundlicher Leerzustand.
- LLM liefert Trim ohne Deckung/über Spielraum → von `normalizeAndFilter` verworfen/geklemmt.

## Tests

- `tests/modules/portfolio-analysis.test.ts`: Sektor-Aggregation; Sektor-Cap-Flag +
  overByEur; Positions-Drift-Flag nur bei target>0 und über target+tol; Einzelaktien-Cap;
  leeres Portfolio; unbekannter Sektor → 'Sonstige'; Sortierung nach overByEur.
- `tests/services/advisor.test.ts` (erweitern): Trim auf gehaltene Position + auf
  overByEur geklemmt; Trim ohne Deckung verworfen; Buy weiterhin nur TR-Universum;
  fehlende `action` → buy; `diversification` geparst.

## Risiken & Mitigation

- **LLM überschreitet Rebalancing-Mandat** → harte Klemmung in `normalizeAndFilter`
  (Trim nur auf geflaggte Übergewichte, Betrag ≤ overByEur); Numbers kommen aus dem
  deterministischen Modul, nicht aus dem LLM.
- **Sektor-Taxonomie gemischt (Geografie + Branche)** → bewusst akzeptiert; das
  `sector`-Feld des TR-Universums ist die Gruppierungsdimension. Region-Taxonomie ist
  out-of-scope.
- **Positionen außerhalb des TR-Universums** (TR-PDF-Import) ohne Sektor → `Sonstige`;
  Trim solcher Positionen nur über Positions-Drift-Flag (nicht Sektor-Cap), da Sektor unbekannt.

## Out of Scope (YAGNI)

- Separate Regions-Analyse, Auto-Execute/Trade-Ausführung, konfigurierbarer Cap als UI,
  meinungsbasiertes Stock-Picking, Verkauf von Werten außerhalb gehaltener Positionen.
