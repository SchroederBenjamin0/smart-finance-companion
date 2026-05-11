import { debugWarn } from '@/lib/debug';
import { computeTransactionHash } from '@/lib/hash';
import { openDB, type IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION, type SmartFinanceDB } from './schema';
import { ALL_CONFIG_KEYS } from './types';

let dbPromise: Promise<IDBPDatabase<SmartFinanceDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<SmartFinanceDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SmartFinanceDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const accounts = db.createObjectStore('accounts', {
            keyPath: 'id',
          });
          accounts.createIndex('by-type', 'type', { unique: true });

          const income = db.createObjectStore('incomeEntries', {
            keyPath: 'id',
          });
          income.createIndex('by-date', 'date');
          income.createIndex('by-source', 'source');

          const allocations = db.createObjectStore('allocations', {
            keyPath: 'id',
          });
          allocations.createIndex('by-income', 'incomeEntryId');
          allocations.createIndex('by-account', 'accountType');

          const subs = db.createObjectStore('subscriptions', {
            keyPath: 'id',
          });
          subs.createIndex('by-active', 'isActive');

          const transactions = db.createObjectStore('transactions', {
            keyPath: 'id',
          });
          transactions.createIndex('by-date', 'date');
          transactions.createIndex('by-category', 'category');
          transactions.createIndex('by-csv', 'sourceCsvId');

          const rules = db.createObjectStore('categoryRules', {
            keyPath: 'id',
          });
          rules.createIndex('by-pattern', 'counterpartyPattern');

          const csvImports = db.createObjectStore('csvImports', {
            keyPath: 'id',
          });
          csvImports.createIndex('by-date', 'importedAt');

          const positions = db.createObjectStore('investmentPositions', {
            keyPath: 'id',
          });
          positions.createIndex('by-isin', 'isin', { unique: true });

          const recs = db.createObjectStore('recommendations', {
            keyPath: 'id',
          });
          recs.createIndex('by-date', 'date');
          recs.createIndex('by-trigger', 'trigger');

          const news = db.createObjectStore('newsEvents', { keyPath: 'id' });
          news.createIndex('by-ticker', 'ticker');
          news.createIndex('by-date', 'publishedAt');
          news.createIndex('by-relevance', 'relevance');

          db.createObjectStore('appConfig', { keyPath: 'key' });
          db.createObjectStore('secrets', { keyPath: 'key' });

          const log = db.createObjectStore('appLog', {
            keyPath: 'id',
            autoIncrement: true,
          });
          log.createIndex('by-timestamp', 'timestamp');
          log.createIndex('by-level', 'level');
        }

        if (oldVersion < 2) {
          // v2: notificationLog store, by-hash on transactions, by-expires on csvImports.
          const txStore = transaction.objectStore('transactions');
          if (!txStore.indexNames.contains('by-hash')) {
            txStore.createIndex('by-hash', 'transactionHash');
          }

          const csvImportsStore = transaction.objectStore('csvImports');
          if (!csvImportsStore.indexNames.contains('by-expires')) {
            csvImportsStore.createIndex('by-expires', 'expiresAt');
          }

          if (!db.objectStoreNames.contains('notificationLog')) {
            const notif = db.createObjectStore('notificationLog', { keyPath: 'id' });
            notif.createIndex('by-dedupeKey', 'dedupeKey', { unique: true });
            notif.createIndex('by-firedAt', 'firedAt');
            notif.createIndex('by-type', 'type');
          }
        }
      },
      blocked() {
        debugWarn('IndexedDB upgrade blocked by another tab');
      },
      blocking() {
        // Another tab wants to upgrade — close this connection
        if (dbPromise) {
          void dbPromise.then((db) => db.close());
          dbPromise = null;
        }
      },
      terminated() {
        dbPromise = null;
      },
    }).then(async (db) => {
      await runPostUpgradeBackfill(db).catch((e) => {
        debugWarn('Post-upgrade backfill failed', e);
      });
      return db;
    });
  }
  return dbPromise;
}

export async function resetDB(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

async function runPostUpgradeBackfill(db: IDBPDatabase<SmartFinanceDB>): Promise<void> {
  const flag = await db.get('appConfig', ALL_CONFIG_KEYS.hashBackfillComplete);
  if (flag?.value === 'true') return;

  // 1) Backfill transactionHash + isAnomaly for transactions without hash.
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

  // 2) Backfill expiresAt for existing csvImports.
  const csvAll = await db.getAll('csvImports');
  const csvToBackfill = csvAll.filter((c) => !c.expiresAt);
  if (csvToBackfill.length > 0) {
    const updated = csvToBackfill.map((c) => ({
      ...c,
      expiresAt: addDaysIso(c.importedAt, 30),
    }));
    const wTx = db.transaction('csvImports', 'readwrite');
    await Promise.all(updated.map((c) => wTx.objectStore('csvImports').put(c)));
    await wTx.done;
  }

  // 3) Set flag so we don't re-run.
  await db.put('appConfig', {
    key: ALL_CONFIG_KEYS.hashBackfillComplete,
    value: 'true',
    updatedAt: new Date().toISOString(),
  });
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
