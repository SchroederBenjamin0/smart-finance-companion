import { getDB } from '../client';
import { tryAsync, type Result } from '@/lib/result';
import type { Recommendation, RecommendationTrigger } from '../types';

export const recommendationsRepo = {
  async findByTrigger(
    trigger: RecommendationTrigger,
    limit = 1,
  ): Promise<Result<Recommendation[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      const all = await db.getAllFromIndex(
        'recommendations',
        'by-trigger',
        trigger,
      );
      return all
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit);
    });
  },

  async findRecent(limit = 5): Promise<Result<Recommendation[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      const all = await db.getAll('recommendations');
      return all
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit);
    });
  },

  /**
   * One recommendation per income entry (the one persisted by AdvisorSheet
   * directly after the LLM responded). Returns null when none exists.
   */
  async findByIncomeEntry(
    incomeEntryId: string,
  ): Promise<Result<Recommendation | null>> {
    return tryAsync(async () => {
      const db = await getDB();
      const all = await db.getAll('recommendations');
      const match = all.find((r) => r.incomeEntryId === incomeEntryId) ?? null;
      return match;
    });
  },

  async upsert(rec: Recommendation): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      await db.put('recommendations', rec);
    });
  },
};
