import { tryAsync, type Result } from '@/lib/result';

export interface YahooQuote {
  symbol: string;
  price: number;
  changePercent: number;
  currency: string;
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
    return results.map((r) => ({
      symbol: r.symbol,
      price: r.regularMarketPrice ?? 0,
      changePercent: r.regularMarketChangePercent ?? 0,
      currency: r.currency ?? 'EUR',
    }));
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
};

export function tickerFromIsin(isin: string): string | null {
  return ISIN_TO_TICKER[isin.toUpperCase()] ?? null;
}

export function trDeepLink(isin: string): string {
  return `https://traderepublic.com/de-de/${isin}`;
}
