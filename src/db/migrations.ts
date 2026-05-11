import type { IDBPDatabase } from 'idb';
import { computeTransactionHash } from '@/lib/hash';
import { addDays } from '@/lib/date';
import { ALL_CONFIG_KEYS } from './types';
import type { SmartFinanceDB } from './schema';

export async function runPostUpgradeBackfill(db: IDBPDatabase<SmartFinanceDB>): Promise<void> {
  const flag = await db.get('appConfig', ALL_CONFIG_KEYS.hashBackfillComplete);
  if (flag?.value === 'true') return;

  // All hash computations resolve via Promise.all BEFORE the rw transaction
  // is opened, so the puts run synchronously within a single live transaction.
  const txAll = await db.getAll('transactions');
  const toBackfill = txAll.filter((t) => !t.transactionHash);
  if (toBackfill.length > 0) {
    const hashed = await Promise.all(
      toBackfill.map(async (t) => ({
        ...t,
        transactionHash: await computeTransactionHash({
          date: t.date,
          amount: t.amount,
          counterparty: t.counterparty,
        }),
        isAnomaly: t.isAnomaly ?? 0,
      })),
    );
    const wTx = db.transaction('transactions', 'readwrite');
    await Promise.all(hashed.map((t) => wTx.objectStore('transactions').put(t)));
    await wTx.done;
  }

  const csvAll = await db.getAll('csvImports');
  const csvToBackfill = csvAll.filter((c) => !c.expiresAt);
  if (csvToBackfill.length > 0) {
    const updated = csvToBackfill.map((c) => ({
      ...c,
      expiresAt: addDays(c.importedAt, 30),
    }));
    const wTx = db.transaction('csvImports', 'readwrite');
    await Promise.all(updated.map((c) => wTx.objectStore('csvImports').put(c)));
    await wTx.done;
  }

  await db.put('appConfig', {
    key: ALL_CONFIG_KEYS.hashBackfillComplete,
    value: 'true',
    updatedAt: new Date().toISOString(),
  });
}
