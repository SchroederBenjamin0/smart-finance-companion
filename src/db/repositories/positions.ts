import { getDB } from '../client';
import { tryAsync, type Result } from '@/lib/result';
import type { InvestmentPosition } from '../types';

export const positionsRepo = {
  async findAll(): Promise<Result<InvestmentPosition[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      const all = await db.getAll('investmentPositions');
      return all.sort((a, b) => b.currentValue - a.currentValue);
    });
  },

  async upsert(position: InvestmentPosition): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      await db.put('investmentPositions', position);
    });
  },

  async remove(id: string): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      await db.delete('investmentPositions', id);
    });
  },
};
