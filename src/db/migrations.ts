import type { IDBPDatabase } from 'idb';
import { computeTransactionHash } from '@/lib/hash';
import { addDays, nowIso } from '@/lib/date';
import { generateId } from '@/lib/id';
import { ALL_CONFIG_KEYS } from './types';
import {
  INTERNAL_TRANSFER_PATTERNS,
  matchesInternalTransfer,
} from '@/modules/categorizer/seedRules';
import { isHeatsAmount } from '@/modules/categorizer/heatsDetector';
import type { SmartFinanceDB } from './schema';

export async function runPostUpgradeBackfill(db: IDBPDatabase<SmartFinanceDB>): Promise<void> {
  const flag = await db.get('appConfig', ALL_CONFIG_KEYS.hashBackfillComplete);

  // The hash/CSV backfill only needs to run once (gated by hashBackfillComplete).
  // The three migrations below were added later and each guard themselves with
  // their own config flag, so they MUST run on every open and decide for
  // themselves — they cannot sit behind hashBackfillComplete, or an existing
  // user (who already has that flag set) would never receive them.
  if (flag?.value !== 'true') {
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

  await migrateInvestmentAccountAway(db);
  await reclassifyInternalTransfers(db);
  await reclassifyHeatsAndInstantSavings(db);
}

/**
 * Retroactively flips two types of misclassified transactions:
 *   1. Expense rows with amount = 7,80 € or 15,60 € → `tabak`.
 *   2. ANY row (regardless of current category, sign of amount) whose
 *      counterparty matches one of the internal-transfer patterns now
 *      that the list has been broadened to include `To/From Instant
 *      Savings`. The patterns are anchored regex (`^…$`) and specific
 *      enough that hitting them is a definitive signal — a real expense
 *      will never have a counterparty literally named "To Personal
 *      Account" or "From Instant Savings".
 *
 * Idempotent via its own config flag, separate from the v1 internal-
 * transfer migration which is also marked done by now.
 */
async function reclassifyHeatsAndInstantSavings(
  db: IDBPDatabase<SmartFinanceDB>,
): Promise<void> {
  const flag = await db.get(
    'appConfig',
    ALL_CONFIG_KEYS.heatsAndInstantSavingsReclassifyV1,
  );
  if (flag?.value === 'true') return;

  const txAll = await db.getAll('transactions');
  const updates = new Map<string, (typeof txAll)[number]>();
  for (const t of txAll) {
    if (
      t.amount < 0 &&
      t.category !== 'tabak' &&
      isHeatsAmount(t.amount)
    ) {
      updates.set(t.id, { ...t, category: 'tabak' });
      continue;
    }
    if (
      t.category !== 'umbuchung' &&
      matchesInternalTransfer(t.counterparty)
    ) {
      updates.set(t.id, { ...t, category: 'umbuchung' });
    }
  }

  if (updates.size > 0) {
    const tx = db.transaction('transactions', 'readwrite');
    await Promise.all([
      ...Array.from(updates.values()).map((t) =>
        tx.objectStore('transactions').put(t),
      ),
      tx.done,
    ]);
  }

  await db.put('appConfig', {
    key: ALL_CONFIG_KEYS.heatsAndInstantSavingsReclassifyV1,
    value: 'true',
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Existing transactions categorized as `transfer` whose counterparty looks
 * like an internal Revolut/own-account move get re-labelled to the new
 * `umbuchung` category. After this, the spending stats only filter out
 * actual own-account moves — outgoing payments to third parties
 * (still `transfer`) remain visible as real spending. Idempotent via a
 * config flag so this only runs once per user.
 */
async function reclassifyInternalTransfers(
  db: IDBPDatabase<SmartFinanceDB>,
): Promise<void> {
  const flag = await db.get(
    'appConfig',
    ALL_CONFIG_KEYS.internalTransferReclassifyV1,
  );
  if (flag?.value === 'true') return;

  const all = await db.getAll('transactions');
  const toRelabel = all.filter(
    (t) => t.category === 'transfer' && matchesInternalTransfer(t.counterparty),
  );
  if (toRelabel.length > 0) {
    const tx = db.transaction('transactions', 'readwrite');
    await Promise.all([
      ...toRelabel.map((t) =>
        tx.objectStore('transactions').put({ ...t, category: 'umbuchung' }),
      ),
      tx.done,
    ]);
  }

  // Also fix the rule store: existing rules that match an INTERNAL_TRANSFER
  // pattern but are stored with the legacy `transfer` category get their
  // category flipped to `umbuchung`; missing patterns get added so future
  // imports classify own-account moves correctly without the LLM.
  const existingRules = await db.getAll('categoryRules');
  const internalSet = new Set(INTERNAL_TRANSFER_PATTERNS);
  const tx2 = db.transaction('categoryRules', 'readwrite');
  const store = tx2.objectStore('categoryRules');
  for (const rule of existingRules) {
    if (
      internalSet.has(rule.counterpartyPattern) &&
      rule.category === 'transfer'
    ) {
      await store.put({ ...rule, category: 'umbuchung' });
    }
  }
  const havePattern = new Set(
    existingRules.map((r) => r.counterpartyPattern),
  );
  for (const pattern of INTERNAL_TRANSFER_PATTERNS) {
    if (havePattern.has(pattern)) continue;
    await store.put({
      id: generateId(),
      counterpartyPattern: pattern,
      matchType: 'regex',
      category: 'umbuchung',
      createdBy: 'system',
      hitCount: 0,
      lastUsed: null,
      createdAt: nowIso(),
    });
  }
  await tx2.done;

  await db.put('appConfig', {
    key: ALL_CONFIG_KEYS.internalTransferReclassifyV1,
    value: 'true',
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Net-Worth-Refactor: das interne `investment`-Konto wird nicht mehr als
 * Bucket geführt — die einzige Investment-Wahrheit ist das Portfolio
 * (TR-PDF-Import). Beim Upgrade wird der vorhandene Saldo nach
 * `legacy_investment_balance` in appConfig archiviert und das Account-Record
 * gelöscht. Idempotent über das Vorhandensein des Account-Records gesteuert.
 */
async function migrateInvestmentAccountAway(
  db: IDBPDatabase<SmartFinanceDB>,
): Promise<void> {
  const all = await db.getAllFromIndex('accounts', 'by-type', 'investment');
  if (all.length === 0) return;
  const archived = all.reduce((sum, a) => sum + (a.balance ?? 0), 0);
  if (archived > 0) {
    await db.put('appConfig', {
      key: ALL_CONFIG_KEYS.legacyInvestmentBalance,
      value: JSON.stringify(archived),
      updatedAt: new Date().toISOString(),
    });
  }
  const tx = db.transaction('accounts', 'readwrite');
  await Promise.all([
    ...all.map((a) => tx.objectStore('accounts').delete(a.id)),
    tx.done,
  ]);
}
