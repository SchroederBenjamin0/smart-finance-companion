import { getDB } from '../client';
import { tryAsync, ok, err, type Result } from '@/lib/result';
import type { CSVImport, Transaction } from '../types';

export const csvImportsRepo = {
  async findAll(): Promise<Result<CSVImport[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      const all = await db.getAll('csvImports');
      return all.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
    });
  },

  async createWithTransactions(
    record: CSVImport,
    transactions: Transaction[],
  ): Promise<Result<void>> {
    try {
      const db = await getDB();
      const tx = db.transaction(['csvImports', 'transactions'], 'readwrite');
      await tx.objectStore('csvImports').put(record);
      for (const t of transactions) {
        await tx.objectStore('transactions').put(t);
      }
      await tx.done;
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  },
};
