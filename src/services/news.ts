import { ok, tryAsync, type Result } from '@/lib/result';
import { newsCacheRepo } from '@/db/repositories/newsCache';
import type { NewsCacheItem } from '@/db/types';
import { fetchNewsForSymbol } from './yahoo';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function isFresh(fetchedAt: string): boolean {
  const t = new Date(fetchedAt).getTime();
  return Number.isFinite(t) && Date.now() - t < CACHE_TTL_MS;
}

/**
 * Cached news lookup for a single Yahoo ticker. Returns up to 5 headlines.
 * Cache TTL is 6 hours — news at this layer is for context-display only,
 * not signal generation, so a stale cache is preferred over hammering Yahoo.
 */
export async function getNewsForTicker(
  ticker: string,
): Promise<Result<NewsCacheItem[]>> {
  return tryAsync(async () => {
    const cached = await newsCacheRepo.get(ticker);
    if (cached.ok && cached.value && isFresh(cached.value.fetchedAt)) {
      return cached.value.items.slice(0, 5);
    }

    const fresh = await fetchNewsForSymbol(ticker);
    const items: NewsCacheItem[] = fresh.slice(0, 5).map((n) => ({
      uuid: n.uuid,
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      publishedAt: n.publishedAt,
    }));

    // Even if the fetch returned nothing, write the cache so we don't
    // re-hit Yahoo for every render of the same panel.
    const persistResult = await newsCacheRepo.upsert({
      ticker,
      items,
      fetchedAt: new Date().toISOString(),
    });
    if (!persistResult.ok) {
      // Persisting is best-effort. Surface items either way.
      void persistResult;
    }
    return items;
  });
}

export type { NewsCacheItem };
export { ok };
