import { getDB } from '../client';
import { tryAsync, ok, err, type Result } from '@/lib/result';
import { computeTransactionHash } from '@/lib/hash';
import { addDays } from '@/lib/date';
import type { CSVImport, Transaction } from '../types';

export interface ImportResult {
  inserted: number;
  skipped: number;
  importId: string;
}

export const csvImportsRepo = {
  async findAll(): Promise<Result<CSVImport[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      const all = await db.getAll('csvImports');
      return all.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
    });
  },

  /**
   * Inserts the CSV-Import record and its transactions in a single IDB rw transaction.
   * Computes a SHA-256 hash per transaction (date | cents | normalized counterparty)
   * and skips any row whose hash already exists in `transactions` (via by-hash index).
   * Sets the import record's `expiresAt` to `importedAt + 30 days` for the retention
   * cleanup job. Returns counts for the import-summary UI.
   * Note: the stored `transactionCount` reflects newly inserted rows after
   * dedupe, not the total rows in the source CSV.
   */
  async createWithTransactions(
    record: Omit<CSVImport, 'expiresAt' | 'transactionCount'>,
    transactions: Omit<Transaction, 'transactionHash' | 'isAnomaly'>[],
  ): Promise<Result<ImportResult>> {
    try {
      const db = await getDB();

      // Hashes are computed BEFORE opening the rw transaction (crypto.subtle is async).
      const hashed: Transaction[] = await Promise.all(
        transactions.map(async (t) => ({
          ...t,
          transactionHash: await computeTransactionHash({
            date: t.date,
            amount: t.amount,
            counterparty: t.counterparty,
          }),
          isAnomaly: 0,
        })),
      );

      const tx = db.transaction(['csvImports', 'transactions'], 'readwrite');
      const txStore = tx.objectStore('transactions');
      const hashIdx = txStore.index('by-hash');

      let inserted = 0;
      let skipped = 0;

      for (const t of hashed) {
        const existing = await hashIdx.get(t.transactionHash);
        if (existing) {
          skipped += 1;
        } else {
          await txStore.put(t);
          inserted += 1;
        }
      }

      const importRecord: CSVImport = {
        ...record,
        transactionCount: inserted,
        expiresAt: addDays(record.importedAt, 30),
      };
      await tx.objectStore('csvImports').put(importRecord);

      await tx.done;
      return ok({ inserted, skipped, importId: record.id });
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  },

  /** Deletes all import-meta rows with expiresAt < now. Idempotent. */
  async cleanExpired(): Promise<Result<number>> {
    return tryAsync(async () => {
      const db = await getDB();
      const now = new Date().toISOString();
      const tx = db.transaction('csvImports', 'readwrite');
      const idx = tx.objectStore('csvImports').index('by-expires');
      let cursor = await idx.openCursor(IDBKeyRange.upperBound(now, true));
      let deleted = 0;
      while (cursor) {
        await cursor.delete();
        deleted += 1;
        cursor = await cursor.continue();
      }
      await tx.done;
      return deleted;
    });
  },
};
