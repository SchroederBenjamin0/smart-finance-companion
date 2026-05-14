import { getDB } from '../client';
import { tryAsync, type Result } from '@/lib/result';
import type { NewsCacheEntry } from '../types';

export const newsCacheRepo = {
  async get(ticker: string): Promise<Result<NewsCacheEntry | null>> {
    return tryAsync(async () => {
      const db = await getDB();
      const hit = await db.get('newsCache', ticker.toUpperCase());
      return hit ?? null;
    });
  },

  async upsert(entry: NewsCacheEntry): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      await db.put('newsCache', {
        ...entry,
        ticker: entry.ticker.toUpperCase(),
      });
    });
  },
};
