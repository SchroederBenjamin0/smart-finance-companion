import { getDB } from '../client';
import { tryAsync, ok, err, type Result } from '@/lib/result';
import { nowIso } from '@/lib/date';
import { generateId } from '@/lib/id';
import type {
  Account,
  Allocation,
  IncomeClassification,
  IncomeEntry,
  IncomeSource,
} from '../types';

export interface IncomeWithSplit {
  amount: number;
  source: IncomeSource;
  date: string;
  note: string | null;
  classification: IncomeClassification;
  funAmount: number;
  savingsAmount: number;
  investmentAmount: number;
}

export const incomeRepo = {
  async findAll(): Promise<Result<IncomeEntry[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      const entries = await db.getAll('incomeEntries');
      return entries.sort((a, b) => b.date.localeCompare(a.date));
    });
  },

  async findRecent(limit: number): Promise<Result<IncomeEntry[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      const entries = await db.getAll('incomeEntries');
      return entries
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    });
  },

  async createWithAllocations(
    input: IncomeWithSplit,
  ): Promise<Result<{ income: IncomeEntry; allocations: Allocation[] }>> {
    try {
      const db = await getDB();
      const tx = db.transaction(
        ['incomeEntries', 'allocations', 'accounts'],
        'readwrite',
      );

      const income: IncomeEntry = {
        id: generateId(),
        date: input.date,
        amount: input.amount,
        source: input.source,
        note: input.note,
        classification: input.classification,
        createdAt: nowIso(),
      };

      const allocations: Allocation[] = [
        buildAllocation(income.id, 'fun', input.funAmount),
        buildAllocation(income.id, 'savings', input.savingsAmount),
        buildAllocation(income.id, 'investment', input.investmentAmount),
      ];

      await tx.objectStore('incomeEntries').put(income);
      for (const a of allocations) {
        await tx.objectStore('allocations').put(a);
      }

      const accountStore = tx.objectStore('accounts');
      await Promise.all([
        addToBalance(accountStore, 'fun', input.funAmount),
        addToBalance(accountStore, 'savings', input.savingsAmount),
        addToBalance(accountStore, 'investment', input.investmentAmount),
      ]);

      await tx.done;
      return ok({ income, allocations });
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  },
};

function buildAllocation(
  incomeEntryId: string,
  accountType: Allocation['accountType'],
  amount: number,
): Allocation {
  return {
    id: generateId(),
    incomeEntryId,
    accountType,
    amount,
    status: 'confirmed',
    createdAt: nowIso(),
  };
}

async function addToBalance(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: any,
  type: Account['type'],
  delta: number,
): Promise<void> {
  const matches: Account[] = await store.index('by-type').getAll(type);
  const account = matches[0];
  if (!account) throw new Error(`No account of type ${type}`);
  account.balance = round2(account.balance + delta);
  account.lastUpdated = nowIso();
  await store.put(account);
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
