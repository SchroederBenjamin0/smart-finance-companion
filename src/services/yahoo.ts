import { tryAsync, type Result } from '@/lib/result';
import { getRateToEur } from './fx';

export interface YahooQuote {
  symbol: string;
  /** Price normalized to EUR. Original currency is in `originalCurrency`. */
  price: number;
  changePercent: number;
  currency: 'EUR';
  originalCurrency: string;
}

const CHART_ENDPOINT = 'https://query1.finance.yahoo.com/v8/finance/chart';

interface ChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        currency?: string;
      };
    }>;
    error?: { code?: string; description?: string } | null;
  };
}

async function fetchOnce(url: string, signal?: AbortSignal): Promise<Response> {
  return fetch(url, { signal });
}

/**
 * Fetches one symbol via Yahoo's v8 chart endpoint, which (unlike the
 * v7 quote endpoint) doesn't require auth crumbs and works directly
 * from browsers. Falls back through public CORS proxies if needed.
 */
async function fetchOneSymbol(symbol: string): Promise<{
  price: number;
  prevClose: number;
  currency: string;
} | null> {
  const target = `${CHART_ENDPOINT}/${encodeURIComponent(
    symbol,
  )}?interval=1d&range=2d`;

  const attempts: string[] = [
    target,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    `https://corsproxy.io/?${encodeURIComponent(target)}`,
  ];

  for (const u of attempts) {
    try {
      const res = await fetchOnce(u);
      if (!res.ok) continue;
      const data = (await res.json()) as ChartResponse;
      const meta = data.chart?.result?.[0]?.meta;
      if (!meta || typeof meta.regularMarketPrice !== 'number') continue;
      return {
        price: meta.regularMarketPrice,
        prevClose: meta.chartPreviousClose ?? meta.regularMarketPrice,
        currency: (meta.currency ?? 'EUR').toUpperCase(),
      };
    } catch {
      // try next attempt
    }
  }
  return null;
}

export async function fetchQuotes(
  symbols: string[],
): Promise<Result<YahooQuote[]>> {
  if (symbols.length === 0) return { ok: true, value: [] };
  return tryAsync(async () => {
    const results = await Promise.all(symbols.map(fetchOneSymbol));
    const quotes: YahooQuote[] = [];
    let success = 0;
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i]!;
      const r = results[i];
      if (!r) continue;
      success += 1;
      const original = r.currency;
      const rawPrice = r.price;
      let price = rawPrice;
      if (original !== 'EUR' && rawPrice > 0) {
        const fx = await getRateToEur(original);
        if (fx.ok) price = rawPrice * fx.value;
      }
      const change =
        r.prevClose > 0 ? ((rawPrice - r.prevClose) / r.prevClose) * 100 : 0;
      quotes.push({
        symbol,
        price,
        changePercent: change,
        currency: 'EUR',
        originalCurrency: original,
      });
    }
    if (success === 0) {
      throw new Error('Keine Kurse verfügbar (Yahoo blockiert direkt + Proxies)');
    }
    return quotes;
  });
}

/**
 * Map an ISIN to the Yahoo ticker we want to query. Prefer EUR-listed
 * symbols so we don't always hit the FX-conversion path.
 */
const ISIN_TO_TICKER: Record<string, string> = {
  // Core ETFs
  IE00B4L5Y983: 'IWDA.AS', // iShares Core MSCI World
  IE00BKM4GZ66: 'EIMI.DE', // iShares Core MSCI EM IMI
  IE00B53SZB19: 'CSNDX.DE', // iShares Nasdaq 100
  IE00BFY0GT14: 'SPYI.DE', // SPDR MSCI ACWI IMI
  IE00BJ0KDQ92: 'XMME.DE', // Xtrackers MSCI World
  IE00B0M62Q58: 'IUSA.DE', // iShares Core S&P 500
  LU0252633754: 'DBXD.DE', // Xtrackers DAX UCITS ETF 1C
  // Single-name equities — prefer EUR-listings on XETRA / Frankfurt
  DE0007500001: 'TKA.DE', // thyssenkrupp AG
  US67066G1040: 'NVD.DE', // NVIDIA Corp. (Frankfurt EUR listing)
  AU000000DRO2: 'DRO.AX', // DroneShield Ltd (AUD-listed; converted to EUR)
};

export function tickerFromIsin(isin: string): string | null {
  return ISIN_TO_TICKER[isin.toUpperCase()] ?? null;
}

export function trDeepLink(isin: string): string {
  return `https://traderepublic.com/de-de/${isin}`;
}
