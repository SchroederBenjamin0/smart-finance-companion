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

  async findSince(iso: string): Promise<Result<IncomeEntry[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      const all = await db.getAllFromIndex('incomeEntries', 'by-date');
      return all.filter((e) => e.date >= iso);
    });
  },

  async deleteWithAllocations(id: string): Promise<Result<void>> {
    try {
      const db = await getDB();
      const tx = db.transaction(
        ['incomeEntries', 'allocations', 'accounts'],
        'readwrite',
      );
      const allocations = await tx
        .objectStore('allocations')
        .index('by-income')
        .getAll(id);
      const accountStore = tx.objectStore('accounts');
      for (const a of allocations) {
        // 'investment' is a plan-only allocation (no Account row exists for it).
        // We delete the allocation record but never touch a balance.
        if (a.accountType !== 'investment') {
          const matches: Account[] = await accountStore
            .index('by-type')
            .getAll(a.accountType);
          const account = matches[0];
          if (account) {
            account.balance = round2(account.balance - a.amount);
            account.lastUpdated = nowIso();
            await accountStore.put(account);
          }
        }
        await tx.objectStore('allocations').delete(a.id);
      }
      await tx.objectStore('incomeEntries').delete(id);
      await tx.done;
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
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
      // Investment-Allokation ist nur Plan-Eintrag — sie wird in Allocations
      // protokolliert, aktualisiert aber keine Account-Balance (das Portfolio
      // ist die Investment-Wahrheit, gefüllt aus dem TR-PDF-Import).
      await Promise.all([
        addToBalance(accountStore, 'fun', input.funAmount),
        addToBalance(accountStore, 'savings', input.savingsAmount),
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
