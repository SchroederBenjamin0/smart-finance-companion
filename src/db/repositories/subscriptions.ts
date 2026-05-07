import { getDB } from '../client';
import { tryAsync, type Result } from '@/lib/result';
import type { Subscription } from '../types';

export const subscriptionsRepo = {
  async findAll(): Promise<Result<Subscription[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      const all = await db.getAll('subscriptions');
      return all.sort((a, b) => a.nextBillDate.localeCompare(b.nextBillDate));
    });
  },

  async findActive(): Promise<Result<Subscription[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      const active = await db.getAllFromIndex(
        'subscriptions',
        'by-active',
        1,
      );
      return active.sort((a, b) =>
        a.nextBillDate.localeCompare(b.nextBillDate),
      );
    });
  },

  async upsert(subscription: Subscription): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      await db.put('subscriptions', subscription);
    });
  },

  async upsertMany(subs: Subscription[]): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      const tx = db.transaction('subscriptions', 'readwrite');
      await Promise.all([
        ...subs.map((s) => tx.store.put(s)),
        tx.done,
      ]);
    });
  },

  async remove(id: string): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      await db.delete('subscriptions', id);
    });
  },
};
