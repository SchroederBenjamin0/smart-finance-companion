import { getDB } from '../client';
import { ok, err, tryAsync, type Result } from '@/lib/result';
import { nowIso } from '@/lib/date';
import type { Account, AccountType } from '../types';

export const accountsRepo = {
  async findAll(): Promise<Result<Account[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      return db.getAll('accounts');
    });
  },

  async findByType(type: AccountType): Promise<Result<Account | null>> {
    return tryAsync(async () => {
      const db = await getDB();
      const matches = await db.getAllFromIndex('accounts', 'by-type', type);
      return matches[0] ?? null;
    });
  },

  async upsert(account: Account): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      await db.put('accounts', account);
    });
  },

  async upsertMany(accounts: Account[]): Promise<Result<void>> {
    try {
      const db = await getDB();
      const tx = db.transaction('accounts', 'readwrite');
      await Promise.all([
        ...accounts.map((a) => tx.store.put(a)),
        tx.done,
      ]);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  },

  async addToBalance(
    type: AccountType,
    delta: number,
  ): Promise<Result<Account>> {
    try {
      const db = await getDB();
      const tx = db.transaction('accounts', 'readwrite');
      const matches = await tx.store
        .index('by-type')
        .getAll(type);
      const account = matches[0];
      if (!account) {
        await tx.done;
        return err(new Error(`No account of type ${type}`));
      }
      account.balance = round2(account.balance + delta);
      account.lastUpdated = nowIso();
      await tx.store.put(account);
      await tx.done;
      return ok(account);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  },

  /**
   * Overwrite the balance of an existing bank account. Used by the Revolut
   * CSV import (authoritative ground truth) and the manual Settings override.
   */
  async setBalance(
    type: AccountType,
    balance: number,
  ): Promise<Result<Account>> {
    try {
      const db = await getDB();
      const tx = db.transaction('accounts', 'readwrite');
      const matches = await tx.store
        .index('by-type')
        .getAll(type);
      const account = matches[0];
      if (!account) {
        await tx.done;
        return err(new Error(`No account of type ${type}`));
      }
      account.balance = round2(balance);
      account.lastUpdated = nowIso();
      await tx.store.put(account);
      await tx.done;
      return ok(account);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  },
};

const round2 = (n: number): number => Math.round(n * 100) / 100;
