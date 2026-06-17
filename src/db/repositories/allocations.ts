import { getDB } from '../client';
import { tryAsync, type Result } from '@/lib/result';
import type { Allocation } from '../types';

export const allocationsRepo = {
  async findByIncome(incomeId: string): Promise<Result<Allocation[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      return db.getAllFromIndex('allocations', 'by-income', incomeId);
    });
  },
};
