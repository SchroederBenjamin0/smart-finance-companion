import { getDB } from '../client';
import { tryAsync, type Result } from '@/lib/result';
import type { PriceCacheEntry } from '../types';

const TTL_HOURS = 24;

export const priceCacheRepo = {
  /** Returns the cached entry if not stale, or null. */
  async get(ticker: string): Promise<Result<PriceCacheEntry | null>> {
    return tryAsync(async () => {
      const db = await getDB();
      const entry = await db.get('priceCache', ticker);
      if (!entry) return null;
      const ageMs = Date.now() - new Date(entry.fetchedAt).getTime();
      if (ageMs > TTL_HOURS * 3600 * 1000) return null;
      return entry;
    });
  },

  async upsert(entry: PriceCacheEntry): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      await db.put('priceCache', entry);
    });
  },

  /** Removes cached entries for tickers no longer in the active set. */
  async cleanStale(activeTickers: string[]): Promise<Result<number>> {
    return tryAsync(async () => {
      const db = await getDB();
      const all = await db.getAll('priceCache');
      const active = new Set(activeTickers);
      const tx = db.transaction('priceCache', 'readwrite');
      let deleted = 0;
      for (const entry of all) {
        if (!active.has(entry.ticker)) {
          await tx.objectStore('priceCache').delete(entry.ticker);
          deleted += 1;
        }
      }
      await tx.done;
      return deleted;
    });
  },
};
