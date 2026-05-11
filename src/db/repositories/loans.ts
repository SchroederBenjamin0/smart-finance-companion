import { getDB } from '../client';
import { tryAsync, type Result } from '@/lib/result';
import type { Loan, LoanStatus } from '../types';

export const loansRepo = {
  async findAll(): Promise<Result<Loan[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      const all = await db.getAll('loans');
      return all.sort((a, b) => b.lentAt.localeCompare(a.lentAt));
    });
  },

  async findByStatus(status: LoanStatus): Promise<Result<Loan[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      return db.getAllFromIndex('loans', 'by-status', status);
    });
  },

  async upsert(loan: Loan): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      await db.put('loans', loan);
    });
  },

  async delete(id: string): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      await db.delete('loans', id);
    });
  },
};
