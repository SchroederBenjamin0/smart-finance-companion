import type { StoreNames } from 'idb';
import { getDB } from '../client';
import { tryAsync, type Result } from '@/lib/result';
import { nowIso } from '@/lib/date';
import { configRepo } from './config';
import { ALL_CONFIG_KEYS } from '../types';
import type { SmartFinanceDB } from '../schema';

type FinanceStore = StoreNames<SmartFinanceDB>;

async function clearStores(stores: FinanceStore[]): Promise<void> {
  const db = await getDB();
  await Promise.all(stores.map((s) => db.clear(s)));
}

/** Reset every account balance to 0 without deleting the account rows —
 *  the app relies on the fun/savings/(investment) rows always existing. */
async function resetAccountBalances(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('accounts', 'readwrite');
  const all = await tx.store.getAll();
  const ts = nowIso();
  await Promise.all([
    ...all.map((a) => tx.store.put({ ...a, balance: 0, lastUpdated: ts })),
    tx.done,
  ]);
}

export const dataMaintenanceRepo = {
  /** Delete all subscriptions only. */
  clearSubscriptions(): Promise<Result<void>> {
    return tryAsync(() => clearStores(['subscriptions']));
  },

  /** Delete all transactions (incl. manual) + CSV import records. Balances
   *  are intentionally left untouched (editable under "Konten-Salden"). */
  clearRevolutData(): Promise<Result<void>> {
    return tryAsync(() => clearStores(['transactions', 'csvImports']));
  },

  /** Delete Trade-Republic positions plus their derived price/news caches.
   *  Advisor history (recommendations/newsEvents) is preserved. */
  clearInvestmentPositions(): Promise<Result<void>> {
    return tryAsync(() =>
      clearStores(['investmentPositions', 'priceCache', 'newsCache']),
    );
  },

  /** Wipe ALL financial data and zero balances. Keeps API key (secrets),
   *  PIN, onboarding flag, allocation/category rules and other settings. */
  clearAllFinancialData(): Promise<Result<void>> {
    return tryAsync(async () => {
      await clearStores([
        'incomeEntries',
        'allocations',
        'subscriptions',
        'transactions',
        'csvImports',
        'investmentPositions',
        'loans',
        'recommendations',
        'newsEvents',
        'priceCache',
        'newsCache',
      ]);
      await resetAccountBalances();
      await configRepo.remove(ALL_CONFIG_KEYS.legacyInvestmentBalance);
      await configRepo.remove(ALL_CONFIG_KEYS.legacyInvestmentBannerDismissed);
    });
  },
};
