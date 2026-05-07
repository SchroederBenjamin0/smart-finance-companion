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

const ENDPOINT = 'https://query1.finance.yahoo.com/v7/finance/quote';

interface YahooResponse {
  quoteResponse?: {
    result?: Array<{
      symbol: string;
      regularMarketPrice?: number;
      regularMarketChangePercent?: number;
      currency?: string;
    }>;
    error?: { description?: string } | null;
  };
}

export async function fetchQuotes(
  symbols: string[],
): Promise<Result<YahooQuote[]>> {
  if (symbols.length === 0) return { ok: true, value: [] };
  return tryAsync(async () => {
    const url = `${ENDPOINT}?symbols=${encodeURIComponent(symbols.join(','))}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Yahoo error ${res.status}`);
    }
    const data = (await res.json()) as YahooResponse;
    const results = data.quoteResponse?.result ?? [];

    // Convert to EUR for any non-EUR quotes (FX rates cached 24h).
    const quotes: YahooQuote[] = [];
    for (const r of results) {
      const original = (r.currency ?? 'EUR').toUpperCase();
      const rawPrice = r.regularMarketPrice ?? 0;
      let price = rawPrice;
      if (original !== 'EUR' && rawPrice > 0) {
        const fx = await getRateToEur(original);
        if (fx.ok) price = rawPrice * fx.value;
      }
      quotes.push({
        symbol: r.symbol,
        price,
        changePercent: r.regularMarketChangePercent ?? 0,
        currency: 'EUR',
        originalCurrency: original,
      });
    }
    return quotes;
  });
}

/**
 * Map an ISIN to a Yahoo ticker. Falls back to the ISIN itself, which the
 * caller should treat as "no mapping found".
 */
const ISIN_TO_TICKER: Record<string, string> = {
  // Core ETFs
  IE00B4L5Y983: 'IWDA.AS', // iShares Core MSCI World
  IE00BKM4GZ66: 'EIMI.DE', // iShares Core MSCI EM IMI
  IE00B53SZB19: 'CSNDX.DE', // iShares Nasdaq 100
  IE00BFY0GT14: 'SPYI.DE', // SPDR MSCI ACWI IMI
  IE00BJ0KDQ92: 'XMME.DE', // Xtrackers MSCI World
  IE00B0M62Q58: 'IUSA.DE', // iShares Core S&P 500
  LU0252633754: 'XDAX.DE', // Xtrackers DAX UCITS ETF 1C
  // Common single-name equities
  DE0007500001: 'TKA.DE', // thyssenkrupp AG
  US67066G1040: 'NVDA', // NVIDIA Corp. (USD-quoted)
  AU000000DRO2: 'DRO.AX', // DroneShield Ltd
};

export function tickerFromIsin(isin: string): string | null {
  return ISIN_TO_TICKER[isin.toUpperCase()] ?? null;
}

export function trDeepLink(isin: string): string {
  return `https://traderepublic.com/de-de/${isin}`;
}
