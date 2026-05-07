import { getDB } from '../client';
import { tryAsync, type Result } from '@/lib/result';
import type { NewsEvent } from '../types';

export const newsRepo = {
  async findRecentHigh(limit = 5): Promise<Result<NewsEvent[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      const all = await db.getAllFromIndex(
        'newsEvents',
        'by-relevance',
        'high',
      );
      return all
        .filter((e) => !e.userDismissed)
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        .slice(0, limit);
    });
  },

  async upsertMany(events: NewsEvent[]): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      const tx = db.transaction('newsEvents', 'readwrite');
      await Promise.all([
        ...events.map((e) => tx.store.put(e)),
        tx.done,
      ]);
    });
  },

  async dismiss(id: string): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      const e = await db.get('newsEvents', id);
      if (!e) return;
      e.userDismissed = 1;
      await db.put('newsEvents', e);
    });
  },
};
