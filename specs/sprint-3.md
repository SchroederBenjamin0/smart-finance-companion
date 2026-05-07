# Sprint 3: Investment-Tracking (Wochen 5-6)

## Ziel

User kann sein TR-Portfolio manuell erfassen, App zieht Yahoo-Marktdaten,
zeigt Performance und Drift gegen Ziel-Allokation.

## Definition of Done

✅ User kann Investment-Positionen manuell erfassen (Ticker, ISIN, Anteile)
✅ Yahoo-Finance-Integration zieht aktuelle Marktwerte
✅ Performance pro Position und gesamt wird angezeigt
✅ Drift gegen Ziel-Allokation wird berechnet und visualisiert
✅ TR-Deep-Link-Helper funktioniert (öffnet TR mit ISIN)
✅ Daten-Refresh max alle 4 Stunden, gecacht
✅ Vitest-Tests für Drift-Berechnung grün

## Tasks

### Task 3.1: Yahoo-Finance-Service

`src/services/yahoo.ts`:

Da `yahoo-finance2` für Node.js gedacht ist (verwendet Node-spezifische APIs),
nutzen wir direkten HTTP-Call zu Yahoo's öffentlichem Endpoint:

```typescript
import { Result, ok, err } from '@/lib/result';

const YAHOO_QUOTE_URL =
  'https://query1.finance.yahoo.com/v7/finance/quote';

interface YahooQuote {
  symbol: string;
  regularMarketPrice: number;
  currency: string;
  regularMarketChange: number;
  regularMarketChangePercent: number;
}

export async function fetchQuotes(
  tickers: string[]
): Promise<Result<YahooQuote[]>> {
  if (tickers.length === 0) return ok([]);

  const url = `${YAHOO_QUOTE_URL}?symbols=${tickers.join(',')}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return err(new Error(`Yahoo API ${response.status}`));
    }
    const data = await response.json();
    const quotes = data?.quoteResponse?.result ?? [];
    return ok(quotes);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
```

**CORS-Problem-Workaround**: Yahoo erlaubt CORS für die meisten Endpoints,
aber das kann sich ändern. Falls Probleme: Cloudflare-Worker als Proxy
(siehe `specs/api-integrationen.md`).

**Caching-Layer**:

```typescript
const CACHE_TTL_HOURS = 4;

export async function fetchQuotesCached(
  tickers: string[]
): Promise<Result<YahooQuote[]>> {
  const cached = await loadCachedQuotes(tickers);
  const fresh = cached.filter(c => isFresh(c, CACHE_TTL_HOURS));
  const stale = tickers.filter(t => !fresh.find(f => f.symbol === t));

  if (stale.length === 0) return ok(fresh);

  const fetched = await fetchQuotes(stale);
  if (!fetched.ok) {
    // Fall back to stale cache if available
    return cached.length > 0 ? ok(cached) : fetched;
  }

  await saveQuotesToCache(fetched.value);
  return ok([...fresh, ...fetched.value]);
}
```

### Task 3.2: Investment-Repository

`src/db/repositories/investments.ts` mit CRUD für `investmentPositions`.

### Task 3.3: Position-Erfassen-View

`src/views/InvestmentForm.tsx`:
- Eingabe: Ticker (mit Auto-Search via Yahoo)
- Anzeige: Name, ISIN, Currency (von Yahoo)
- Eingabe: Anzahl Anteile
- Eingabe: Eingezahlt insgesamt
- Auto-berechnet: Aktueller Marktwert
- "Speichern"

### Task 3.4: Investment-Übersicht-View

`src/views/Investments.tsx` nach `ui-flows.md` Tab 4.

```tsx
function InvestmentsView() {
  const positions = useInvestmentsStore(s => s.positions);
  const target = useConfigStore(s => s.allocationTarget);

  const total = sum(positions.map(p => p.currentValue));
  const invested = sum(positions.map(p => p.totalInvested));
  const performance = (total - invested) / invested * 100;
  const drift = computeDrift(positions, target);

  return (
    <div>
      <SummaryCard total={total} invested={invested}
                   performance={performance} />
      <DriftCard drift={drift} />
      <PositionsList positions={positions} target={target} />
      <ActionsRow />
    </div>
  );
}
```

### Task 3.5: Drift-Berechnung

`src/modules/portfolio/drift.ts`:

```typescript
import { InvestmentPosition, AllocationTarget } from '@/db/types';

export interface DriftResult {
  byCategory: { name: string; current: number; target: number;
                drift: number }[];
  maxDrift: number;
  status: 'aligned' | 'minor_drift' | 'rebalance_needed';
}

export function computeDrift(
  positions: InvestmentPosition[],
  target: AllocationTarget
): DriftResult {
  const total = positions.reduce((s, p) => s + p.currentValue, 0);
  if (total === 0) {
    return {
      byCategory: [],
      maxDrift: 0,
      status: 'aligned',
    };
  }

  const grouped = groupByCategory(positions);
  const byCategory = [
    {
      name: 'MSCI World',
      current: pct(grouped.world ?? 0, total),
      target: target.msciWorld,
      drift: pct(grouped.world ?? 0, total) - target.msciWorld,
    },
    {
      name: 'MSCI EM',
      current: pct(grouped.em ?? 0, total),
      target: target.msciEm,
      drift: pct(grouped.em ?? 0, total) - target.msciEm,
    },
    {
      name: 'Nasdaq',
      current: pct(grouped.nasdaq ?? 0, total),
      target: target.nasdaq,
      drift: pct(grouped.nasdaq ?? 0, total) - target.nasdaq,
    },
    {
      name: 'Cash',
      current: pct(grouped.cash ?? 0, total),
      target: target.cash,
      drift: pct(grouped.cash ?? 0, total) - target.cash,
    },
  ];

  const maxDrift = Math.max(...byCategory.map(c => Math.abs(c.drift)));
  const status: DriftResult['status'] =
    maxDrift < 3 ? 'aligned' :
    maxDrift < 7 ? 'minor_drift' :
    'rebalance_needed';

  return { byCategory, maxDrift, status };
}

const pct = (value: number, total: number) =>
  Math.round(value / total * 1000) / 10;
```

**Kategorisierung-Heuristik**: ISIN-Mapping zu Asset-Klassen:
```typescript
const ISIN_CATEGORY_MAP: Record<string, string> = {
  'IE00B4L5Y983': 'world',   // iShares Core MSCI World
  'IE00BKM4GZ66': 'em',      // iShares Core MSCI EM IMI
  'IE00B53SZB19': 'nasdaq',  // iShares Nasdaq 100
  // weitere ETFs...
};
```

User kann im Settings-Edit pro Position auch manuell Kategorie zuweisen,
für Einzelaktien.

### Task 3.6: TR-Deep-Link-Helper

`src/lib/trade-republic.ts`:

```typescript
export function tradeRepublicUrl(isin: string): string {
  // TR Universal Link Format
  return `https://traderepublic.com/de-de/${isin}`;
}

export function openInTradeRepublic(isin: string): void {
  // Universal Links öffnen direkt die App auf iOS,
  // wenn TR installiert ist
  window.location.href = tradeRepublicUrl(isin);
}
```

In Investment-View: Tap auf Position → Modal mit "In TR öffnen"-Button.

### Task 3.7: Refresh-Logik

Manueller Refresh-Button in Investments-View.
Auto-Refresh beim App-Open wenn Cache älter als 4h.
Pull-to-Refresh auf Investments-View triggert Yahoo-Calls.

### Task 3.8: Tests

`tests/modules/portfolio/drift.test.ts`:
- Empty portfolio → status 'aligned', maxDrift 0
- Perfect allocation 65/15/15/5 → status 'aligned'
- 5% drift → status 'minor_drift'
- 10% drift → status 'rebalance_needed'
- Edge case: position with 0 currentValue

`tests/services/yahoo.test.ts`:
- Mock fetch, verify URL construction
- Cache-Hit returns without network call
- Cache-Stale returns fresh data
- Network failure returns stale cache as fallback

## Out of Scope

- ❌ AI-Empfehlungen (Sprint 4)
- ❌ Auto-Discovery von Positionen (kein TR API verfügbar)

## Erwartete Probleme

**Problem**: Yahoo blockt CORS auf manchen Endpoints.
**Lösung**: Cloudflare Worker als Proxy. Setup in
`specs/api-integrationen.md`.

**Problem**: ETF hat unbekannte ISIN, Drift-Logik weiß nicht wo es hingehört.
**Lösung**: Edit-View pro Position mit manuellem Category-Assignment.
Default: "uncategorized" zählt als Cash.

**Problem**: User hat Aktien nicht in EUR.
**Lösung**: Yahoo liefert Currency. Wir wandeln nicht um — User sieht
mehrere Currencies. Sprint 5+ würde Conversion bringen.
