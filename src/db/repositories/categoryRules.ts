import { getDB } from '../client';
import { tryAsync, type Result } from '@/lib/result';
import type { CategoryRule } from '../types';
import { generateId } from '@/lib/id';
import { nowIso } from '@/lib/date';
import {
  seedRulesAsRecords,
  type CategoryRuleSeed,
} from '@/modules/categorizer/seedRules';

export const categoryRulesRepo = {
  async findAll(): Promise<Result<CategoryRule[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      return db.getAll('categoryRules');
    });
  },

  async upsert(rule: CategoryRule): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      await db.put('categoryRules', rule);
    });
  },

  async upsertMany(rules: CategoryRule[]): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      const tx = db.transaction('categoryRules', 'readwrite');
      await Promise.all([
        ...rules.map((r) => tx.store.put(r)),
        tx.done,
      ]);
    });
  },

  async ensureSeeded(): Promise<Result<{ seeded: number }>> {
    return tryAsync(async () => {
      const db = await getDB();
      const existing = await db.count('categoryRules');
      if (existing > 0) return { seeded: 0 };
      const seeds: CategoryRuleSeed[] = seedRulesAsRecords();
      const ts = nowIso();
      const records: CategoryRule[] = seeds.map((s) => ({
        id: generateId(),
        ...s,
        createdAt: ts,
      }));
      const tx = db.transaction('categoryRules', 'readwrite');
      await Promise.all([
        ...records.map((r) => tx.store.put(r)),
        tx.done,
      ]);
      return { seeded: records.length };
    });
  },

  async recordHit(id: string): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      const rule = await db.get('categoryRules', id);
      if (!rule) return;
      rule.hitCount += 1;
      rule.lastUsed = nowIso();
      await db.put('categoryRules', rule);
    });
  },
};
