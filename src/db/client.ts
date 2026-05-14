import { debugWarn } from '@/lib/debug';
import { openDB, unwrap, type IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION, type SmartFinanceDB } from './schema';
import { runPostUpgradeBackfill } from './migrations';

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

          // notificationLog IDB store is kept to avoid a schema bump (the store
          // is inert — no TypeScript interface declares it any more).
          // Use the raw IDBDatabase via idb's `unwrap` to bypass the typed wrapper.
          const rawDb = unwrap(db);
          if (!rawDb.objectStoreNames.contains('notificationLog')) {
            const notif = rawDb.createObjectStore('notificationLog', { keyPath: 'id' });
            notif.createIndex('by-dedupeKey', 'dedupeKey', { unique: true });
            notif.createIndex('by-firedAt', 'firedAt');
            notif.createIndex('by-type', 'type');
          }
        }

        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('loans')) {
            const loans = db.createObjectStore('loans', { keyPath: 'id' });
            loans.createIndex('by-status', 'status');
            loans.createIndex('by-lentAt', 'lentAt');
          }
        }

        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains('priceCache')) {
            const cache = db.createObjectStore('priceCache', { keyPath: 'ticker' });
            cache.createIndex('by-fetchedAt', 'fetchedAt');
          }
        }

        // v5: investment-Account-Removal läuft im post-upgrade backfill,
        // weil hier nur Schema-Änderungen sicher synchron passieren dürfen.
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
