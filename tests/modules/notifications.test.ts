import { describe, it, expect } from 'vitest';
import {
  shouldFireAllocation,
  shouldFireSubscription,
  shouldFireDrift,
  shouldFireCashflow,
  buildAllocationDedupeKey,
  buildSubscriptionDedupeKey,
  buildDriftDedupeKey,
  buildCashflowDedupeKey,
  buildAnomalyDedupeKey,
} from '@/modules/notifications/triggers';
import type { IncomeEntry, InvestmentPosition, Subscription } from '@/db/types';

describe('buildAllocationDedupeKey', () => {
  it('formats as allocation-YYYY-MM', () => {
    expect(buildAllocationDedupeKey(new Date('2026-05-11T10:00:00Z'))).toBe('allocation-2026-05');
  });
  it('uses single-digit month padded', () => {
    expect(buildAllocationDedupeKey(new Date('2026-01-03T00:00:00Z'))).toBe('allocation-2026-01');
  });
});

describe('buildSubscriptionDedupeKey', () => {
  it('combines id and nextBillDate', () => {
    expect(buildSubscriptionDedupeKey('sub-123', '2026-05-15')).toBe('sub-sub-123-2026-05-15');
  });
});

describe('buildDriftDedupeKey', () => {
  it('combines positionId and month', () => {
    expect(buildDriftDedupeKey('pos-1', new Date('2026-05-11T10:00:00Z'))).toBe('drift-pos-1-2026-05');
  });
});

describe('buildCashflowDedupeKey', () => {
  it('uses ISO week format', () => {
    expect(buildCashflowDedupeKey(new Date('2026-05-11T10:00:00Z'))).toMatch(/^cashflow-2026-W\d{2}$/);
  });
});

describe('buildAnomalyDedupeKey', () => {
  it('uses csv import id', () => {
    expect(buildAnomalyDedupeKey('csv-456')).toBe('anomaly-csv-456');
  });
});

describe('shouldFireAllocation', () => {
  const now = new Date('2026-05-11T10:00:00Z');

  it('fires on day 1 if no income entry this month yet', () => {
    const r = shouldFireAllocation({
      now: new Date('2026-05-01T08:00:00Z'),
      incomeEntriesThisMonth: [],
    });
    expect(r.shouldFire).toBe(true);
    expect(r.overdueDays).toBe(0);
  });

  it('does NOT fire on day 1 if income entry already exists', () => {
    const entry: IncomeEntry = {
      id: '1', date: '2026-05-01', amount: 1000, source: 'main_job',
      note: null, classification: 'standard', createdAt: '2026-05-01T07:00:00Z',
    };
    const r = shouldFireAllocation({
      now: new Date('2026-05-01T08:00:00Z'),
      incomeEntriesThisMonth: [entry],
    });
    expect(r.shouldFire).toBe(false);
  });

  it('fires after day 1 if month-allocation is overdue', () => {
    const r = shouldFireAllocation({ now, incomeEntriesThisMonth: [] });
    expect(r.shouldFire).toBe(true);
    expect(r.overdueDays).toBe(10);
  });

  it('does not fire after day 1 if income entry exists this month', () => {
    const entry: IncomeEntry = {
      id: '1', date: '2026-05-08', amount: 1000, source: 'main_job',
      note: null, classification: 'standard', createdAt: '2026-05-08T07:00:00Z',
    };
    const r = shouldFireAllocation({ now, incomeEntriesThisMonth: [entry] });
    expect(r.shouldFire).toBe(false);
  });
});

describe('shouldFireSubscription', () => {
  const base: Subscription = {
    id: 's1', name: 'Lexware', amount: 89, currency: 'EUR',
    billingCycle: 'monthly', nextBillDate: '2026-05-14',
    endDate: null, category: 'gebühren', isActive: 1,
  };

  it('fires if nextBillDate is within 3 days', () => {
    const r = shouldFireSubscription(base, new Date('2026-05-11T10:00:00Z'));
    expect(r.shouldFire).toBe(true);
    expect(r.daysUntil).toBe(3);
  });

  it('fires if nextBillDate is today', () => {
    const r = shouldFireSubscription(base, new Date('2026-05-14T10:00:00Z'));
    expect(r.shouldFire).toBe(true);
    expect(r.daysUntil).toBe(0);
  });

  it('does not fire if more than 3 days away', () => {
    const r = shouldFireSubscription(base, new Date('2026-05-10T10:00:00Z'));
    expect(r.shouldFire).toBe(false);
  });

  it('does not fire if subscription is inactive', () => {
    const r = shouldFireSubscription({ ...base, isActive: 0 }, new Date('2026-05-13T10:00:00Z'));
    expect(r.shouldFire).toBe(false);
  });

  it('does not fire after nextBillDate (overdue gets handled elsewhere)', () => {
    const r = shouldFireSubscription(base, new Date('2026-05-15T10:00:00Z'));
    expect(r.shouldFire).toBe(false);
  });
});

describe('shouldFireDrift', () => {
  const pos: InvestmentPosition = {
    id: 'p1', ticker: 'BTC', isin: 'X', name: 'Bitcoin', assetType: 'stock',
    totalInvested: 1000, shares: 0.01, currentValue: 2200, lastSyncedPrice: '2026-05-11',
    targetPercentage: 10,
  };

  it('fires when current weight > target + tolerance', () => {
    const r = shouldFireDrift(pos, 18, 5);
    expect(r.shouldFire).toBe(true);
    expect(r.deltaPp).toBeCloseTo(8);
  });

  it('does not fire when within tolerance', () => {
    const r = shouldFireDrift(pos, 14, 5);
    expect(r.shouldFire).toBe(false);
  });

  it('fires when current weight < target - tolerance (underweight)', () => {
    const r = shouldFireDrift(pos, 3, 5);
    expect(r.shouldFire).toBe(true);
  });

  it('does not fire when no target set (target=0)', () => {
    const r = shouldFireDrift({ ...pos, targetPercentage: 0 }, 5, 5);
    expect(r.shouldFire).toBe(false);
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
