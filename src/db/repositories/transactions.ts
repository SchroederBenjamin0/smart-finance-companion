import { getDB } from '../client';
import { tryAsync, ok, err, type Result } from '@/lib/result';
import { generateId } from '@/lib/id';
import { nowIso } from '@/lib/date';
import { computeTransactionHash } from '@/lib/hash';
import type { AccountType, Transaction } from '../types';

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const MANUAL_CSV_ID = 'manual';

export interface ManualExpenseInput {
  amount: number;
  counterparty: string;
  category: string;
  date: string;
  note: string | null;
  fromAccount: AccountType;
}

export const transactionsRepo = {
  async findRecent(limit: number): Promise<Result<Transaction[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      const all = await db.getAll('transactions');
      return all
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit);
    });
  },

  /** All transactions with date >= iso (inclusive). Used for month-scoped sums. */
  async findSince(iso: string): Promise<Result<Transaction[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      const all = await db.getAll('transactions');
      return all.filter((t) => t.date >= iso);
    });
  },

  async findByHash(hash: string): Promise<Result<Transaction | null>> {
    return tryAsync(async () => {
      const db = await getDB();
      const hit = await db.getFromIndex('transactions', 'by-hash', hash);
      return hit ?? null;
    });
  },

  async deleteWithReversal(
    id: string,
    fromAccount: AccountType,
  ): Promise<Result<void>> {
    try {
      const db = await getDB();
      const tx = db.transaction(['transactions', 'accounts'], 'readwrite');
      const t = await tx.objectStore('transactions').get(id);
      if (!t) {
        await tx.done;
        return err(new Error('Transaction not found'));
      }
      const accountsStore = tx.objectStore('accounts');
      const matches = await accountsStore
        .index('by-type')
        .getAll(fromAccount);
      const account = matches[0];
      if (account) {
        // Reverse: if t.amount was negative (expense), adding back makes the
        // balance go up. The signed addition handles both expense + income.
        account.balance = round2(account.balance - t.amount);
        account.lastUpdated = nowIso();
        await accountsStore.put(account);
      }
      await tx.objectStore('transactions').delete(id);
      await tx.done;
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  },

  /**
   * Patches annotation fields of an existing transaction (counterparty,
   * category, date, description). Amount and sourceCsvId are NOT editable
   * — those would require account-balance reversals.
   *
   * Recomputes transactionHash when counterparty or date changes so dedupe
   * on future CSV re-imports still works.
   *
   * Also flips isUserReviewed to 1 and categoryConfidence to 1 since the
   * user has now confirmed/edited the row.
   */
  async updateAnnotation(
    id: string,
    patch: {
      counterparty?: string;
      category?: string;
      date?: string;
      description?: string | null;
    },
  ): Promise<Result<Transaction>> {
    return tryAsync(async () => {
      const db = await getDB();
      const tx = db.transaction('transactions', 'readwrite');
      const store = tx.objectStore('transactions');
      const existing = await store.get(id);
      if (!existing) throw new Error('Transaction not found');

      const updated: Transaction = {
        ...existing,
        counterparty: patch.counterparty ?? existing.counterparty,
        category: patch.category ?? existing.category,
        date: patch.date ?? existing.date,
        description:
          patch.description !== undefined ? patch.description : existing.description,
        isUserReviewed: 1,
        categoryConfidence: 1,
      };

      if (patch.counterparty !== undefined || patch.date !== undefined) {
        updated.transactionHash = await computeTransactionHash({
          date: updated.date,
          amount: updated.amount,
          counterparty: updated.counterparty,
        });
      }

      await store.put(updated);
      await tx.done;
      return updated;
    });
  },

  async createManualExpense(
    input: ManualExpenseInput,
  ): Promise<Result<Transaction>> {
    try {
      const db = await getDB();

      const date = input.date;
      const counterparty = input.counterparty;
      const amount = -Math.abs(input.amount);
      const transactionHash = await computeTransactionHash({ date, amount, counterparty });

      const tx = db.transaction(['transactions', 'accounts'], 'readwrite');
      const transaction: Transaction = {
        id: generateId(),
        date,
        amount,
        counterparty,
        description: input.note,
        category: input.category,
        categoryConfidence: 1,
        isUserReviewed: 1,
        sourceCsvId: MANUAL_CSV_ID,
        importedAt: nowIso(),
        transactionHash,
        isAnomaly: 0,
      };
      await tx.objectStore('transactions').put(transaction);

      const accountsStore = tx.objectStore('accounts');
      const matches = await accountsStore.index('by-type').getAll(input.fromAccount);
      const account = matches[0];
      if (!account) {
        await tx.done;
        return err(new Error(`No account of type ${input.fromAccount}`));
      }
      account.balance = round2(account.balance - Math.abs(input.amount));
      account.lastUpdated = nowIso();
      await accountsStore.put(account);

      await tx.done;
      return ok(transaction);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  },
};
