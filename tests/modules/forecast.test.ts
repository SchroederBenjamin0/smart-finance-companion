import { describe, it, expect } from 'vitest';
import { forecastCashflow, shouldFireCashflow } from '@/modules/forecast';
import type { Account, Subscription, Transaction } from '@/db/types';

const funAccount: Account = { id: 'f', type: 'fun', balance: 500, goalAmount: null, lastUpdated: '2026-05-01' };

describe('forecastCashflow', () => {
  it('produces 13 weekly points', () => {
    const r = forecastCashflow({
      accounts: [funAccount], subscriptions: [], transactions: [], incomeEntries: [],
      weeks: 13, now: new Date('2026-05-11'),
    });
    expect(r.length).toBe(13);
  });

  it('decreases balance over time when no income but heavy expenses', () => {
    const txs: Transaction[] = Array.from({ length: 30 }, (_, i) => ({
      id: `t${i}`,
      date: '2026-04-15',
      amount: -50,
      counterparty: 'Kiosk',
      description: null,
      category: 'lebensmittel',
      categoryConfidence: 1,
      isUserReviewed: 0,
      sourceCsvId: 'csv',
      importedAt: '2026-05-01',
      transactionHash: `h${i}`,
      isAnomaly: 0,
    }));
    const r = forecastCashflow({
      accounts: [funAccount],
      subscriptions: [],
      transactions: txs,
      incomeEntries: [],
      weeks: 13,
      now: new Date('2026-05-11'),
    });
    expect(r[r.length - 1]!.funBalance).toBeLessThan(funAccount.balance);
  });

  it('subscriptions due in window are reflected in events', () => {
    const sub: Subscription = {
      id: 's1', name: 'Test', amount: 100, currency: 'EUR',
      billingCycle: 'monthly', nextBillDate: '2026-05-25',
      endDate: null, category: 'gebühren', isActive: 1,
    };
    const r = forecastCashflow({
      accounts: [funAccount], subscriptions: [sub], transactions: [], incomeEntries: [],
      weeks: 13, now: new Date('2026-05-11'),
    });
    expect(r.some((w) => w.events.some((e) => e.type === 'subscription'))).toBe(true);
  });
});

describe('shouldFireCashflow', () => {
  it('fires red if any week in next 30d has funBalance < 0', () => {
    const forecast = [
      { weekStartIso: '2026-05-11', funBalance: 500 },
      { weekStartIso: '2026-05-18', funBalance: 200 },
      { weekStartIso: '2026-05-25', funBalance: -50 },
    ];
    const r = shouldFireCashflow(forecast, 100);
    expect(r.shouldFire).toBe(true);
    expect(r.severity).toBe('red');
  });

  it('fires yellow if balance falls below threshold but stays positive', () => {
    const forecast = [
      { weekStartIso: '2026-05-11', funBalance: 500 },
      { weekStartIso: '2026-05-18', funBalance: 80 },
    ];
    const r = shouldFireCashflow(forecast, 100);
    expect(r.shouldFire).toBe(true);
    expect(r.severity).toBe('yellow');
  });

  it('does not fire if balance stays above threshold', () => {
    const forecast = [
      { weekStartIso: '2026-05-11', funBalance: 500 },
      { weekStartIso: '2026-05-18', funBalance: 250 },
    ];
    const r = shouldFireCashflow(forecast, 100);
    expect(r.shouldFire).toBe(false);
  });
});
