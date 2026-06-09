import { describe, it, expect, beforeEach } from 'vitest';
import { getDB, resetDB } from '@/db/client';
import { dataMaintenanceRepo } from '@/db/repositories/dataMaintenance';
import type { Account, SecretEntry, Subscription, Transaction } from '@/db/types';
import { nowIso } from '@/lib/date';

beforeEach(async () => {
  await resetDB();
});

async function seed(): Promise<void> {
  const db = await getDB();
  const ts = nowIso();

  const account: Account = {
    id: 'acc-savings',
    type: 'savings',
    balance: 375.33,
    goalAmount: null,
    lastUpdated: ts,
  };
  await db.put('accounts', account);

  const sub: Subscription = {
    id: 'sub-1',
    name: 'Splice',
    amount: 9.99,
    currency: 'USD',
    billingCycle: 'monthly',
    nextBillDate: '2026-07-01',
    endDate: null,
    category: 'musik-tools',
    isActive: 1,
  };
  await db.put('subscriptions', sub);

  const txn: Transaction = {
    id: 'txn-1',
    date: '2026-04-03',
    amount: -18.88,
    counterparty: 'EDEKA',
    description: null,
    category: 'lebensmittel',
    categoryConfidence: 0.95,
    isUserReviewed: 1,
    sourceCsvId: 'csv-1',
    importedAt: ts,
    transactionHash: 'hash-1',
    isAnomaly: 0,
  };
  await db.put('transactions', txn);

  const secret: SecretEntry = {
    key: 'anthropic_key',
    encryptedValue: 'enc',
    iv: 'iv',
    createdAt: ts,
  };
  await db.put('secrets', secret);

  await db.put('appConfig', {
    key: 'allocation_rules',
    value: '{}',
    updatedAt: ts,
  });
}

describe('dataMaintenanceRepo.clearSubscriptions', () => {
  it('clears only subscriptions', async () => {
    await seed();
    const r = await dataMaintenanceRepo.clearSubscriptions();
    expect(r.ok).toBe(true);
    const db = await getDB();
    expect(await db.count('subscriptions')).toBe(0);
    expect(await db.count('transactions')).toBe(1);
  });
});

describe('dataMaintenanceRepo.clearRevolutData', () => {
  it('clears transactions and csvImports, keeps subscriptions', async () => {
    await seed();
    const r = await dataMaintenanceRepo.clearRevolutData();
    expect(r.ok).toBe(true);
    const db = await getDB();
    expect(await db.count('transactions')).toBe(0);
    expect(await db.count('csvImports')).toBe(0);
    expect(await db.count('subscriptions')).toBe(1);
  });
});

describe('dataMaintenanceRepo.clearAllFinancialData', () => {
  it('clears financial stores and zeroes balances but keeps secrets + settings', async () => {
    await seed();
    const r = await dataMaintenanceRepo.clearAllFinancialData();
    expect(r.ok).toBe(true);

    const db = await getDB();
    expect(await db.count('subscriptions')).toBe(0);
    expect(await db.count('transactions')).toBe(0);

    const accounts = await db.getAll('accounts');
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.balance).toBe(0);

    // API key and user settings survive a financial-data wipe. (appConfig
    // also holds migration-flag keys written by the DB backfill, so we assert
    // the specific user setting survived rather than the total count.)
    expect(await db.count('secrets')).toBe(1);
    expect(await db.get('appConfig', 'allocation_rules')).toBeDefined();
  });
});
