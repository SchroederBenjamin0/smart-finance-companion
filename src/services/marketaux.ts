import { tryAsync, type Result } from '@/lib/result';
import { secretsRepo } from '@/db/repositories/secrets';

const MARKETAUX_ENDPOINT = 'https://api.marketaux.com/v1/news/all';

export interface MarketauxArticle {
  uuid: string;
  title: string;
  description: string;
  url: string;
  published_at: string;
  source: string;
  entities: Array<{
    symbol: string;
    name: string;
    sentiment_score: number;
  }>;
}

export async function probeMarketauxKey(
  apiKey: string,
): Promise<Result<true>> {
  return tryAsync(async (): Promise<true> => {
    const url = `${MARKETAUX_ENDPOINT}?api_token=${encodeURIComponent(apiKey)}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Marketaux error ${res.status}: ${text}`);
    }
    const data = (await res.json()) as { error?: { message?: string } };
    if (data.error) {
      throw new Error(data.error.message ?? 'Marketaux API error');
    }
    return true;
  });
}

/**
 * Fetch up to `limit` recent articles tagged for the given symbols.
 * Returns an empty array on quota / auth failure (silent fail per spec).
 */
export async function fetchNewsForSymbols(
  symbols: string[],
  limit = 3,
): Promise<Result<MarketauxArticle[]>> {
  return tryAsync(async () => {
    if (symbols.length === 0) return [];
    const keyResult = await secretsRepo.get('marketaux_key');
    if (!keyResult.ok || !keyResult.value) return [];

    const url = new URL(MARKETAUX_ENDPOINT);
    url.searchParams.set('api_token', keyResult.value);
    url.searchParams.set('symbols', symbols.join(','));
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('language', 'en,de');
    url.searchParams.set('filter_entities', 'true');

    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: MarketauxArticle[];
      error?: unknown;
    };
    if (!data.data) return [];
    return data.data;
  });
}
