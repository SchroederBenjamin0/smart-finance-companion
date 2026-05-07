import { getDB } from '../client';
import { tryAsync, type Result } from '@/lib/result';
import type { AccountType, Allocation } from '../types';

export const allocationsRepo = {
  async findByIncome(incomeId: string): Promise<Result<Allocation[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      return db.getAllFromIndex('allocations', 'by-income', incomeId);
    });
  },

  async findByAccount(type: AccountType): Promise<Result<Allocation[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      return db.getAllFromIndex('allocations', 'by-account', type);
    });
  },
};
