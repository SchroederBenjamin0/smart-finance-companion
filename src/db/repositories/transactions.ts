import { getDB } from '../client';
import { tryAsync, ok, err, type Result } from '@/lib/result';
import { generateId } from '@/lib/id';
import { nowIso } from '@/lib/date';
import type { AccountType, Transaction } from '../types';

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

  async createManualExpense(
    input: ManualExpenseInput,
  ): Promise<Result<Transaction>> {
    try {
      const db = await getDB();
      const tx = db.transaction(['transactions', 'accounts'], 'readwrite');
      const transaction: Transaction = {
        id: generateId(),
        date: input.date,
        amount: -Math.abs(input.amount),
        counterparty: input.counterparty,
        description: input.note,
        category: input.category,
        categoryConfidence: 1,
        isUserReviewed: 1,
        sourceCsvId: MANUAL_CSV_ID,
        importedAt: nowIso(),
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

const round2 = (n: number): number => Math.round(n * 100) / 100;
