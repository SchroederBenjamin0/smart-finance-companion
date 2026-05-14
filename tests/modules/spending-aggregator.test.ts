import { describe, it, expect } from 'vitest';
import { aggregateByCategory, filterByRange } from '@/modules/spending';
import type { Transaction } from '@/db/types';

function mkTx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'x',
    date: '2026-05-01',
    amount: -10,
    counterparty: 'X',
    description: null,
    category: 'sonstiges',
    categoryConfidence: 0.5,
    isUserReviewed: 0,
    sourceCsvId: 'csv-1',
    importedAt: '2026-05-01T00:00:00Z',
    transactionHash: 'hash',
    isAnomaly: 0,
    ...partial,
  };
}

describe('filterByRange', () => {
  const txs = [
    mkTx({ date: '2026-05-10' }),
    mkTx({ date: '2026-04-10' }),
    mkTx({ date: '2025-12-01' }),
  ];

  it('returns all transactions for "all"', () => {
    expect(filterByRange(txs, 'all', new Date('2026-05-11')).length).toBe(3);
  });

  it('returns last 30 days', () => {
    const r = filterByRange(txs, 30, new Date('2026-05-11'));
    expect(r.length).toBe(1);
    expect(r[0]?.date).toBe('2026-05-10');
  });

  it('returns last 90 days', () => {
    const r = filterByRange(txs, 90, new Date('2026-05-11'));
    expect(r.map((t) => t.date)).toEqual(['2026-05-10', '2026-04-10']);
  });

  it('returns last 365 days', () => {
    const r = filterByRange(txs, 365, new Date('2026-05-11'));
    expect(r.length).toBe(3);
  });
});

describe('aggregateByCategory', () => {
  it('groups expenses by category, sums absolute amounts, counts entries', () => {
    const txs = [
      mkTx({ id: 'a', category: 'nightlife', amount: -15, counterparty: 'Circle Club' }),
      mkTx({ id: 'b', category: 'nightlife', amount: -22, counterparty: 'Berghain' }),
      mkTx({ id: 'c', category: 'lebensmittel', amount: -8, counterparty: 'REWE' }),
      mkTx({ id: 'd', category: 'nightlife', amount: -10, counterparty: 'Circle Club' }),
    ];
    const rows = aggregateByCategory(txs);
    expect(rows.length).toBe(2);
    const nightlife = rows.find((r) => r.category === 'nightlife')!;
    expect(nightlife.total).toBe(47);
    expect(nightlife.count).toBe(3);
    expect(nightlife.topCounterparty).toBe('Circle Club');
    expect(nightlife.topCounterpartyCount).toBe(2);
  });

  it('sorts by total descending', () => {
    const txs = [
      mkTx({ id: 'a', category: 'lebensmittel', amount: -100 }),
      mkTx({ id: 'b', category: 'nightlife', amount: -200 }),
    ];
    const rows = aggregateByCategory(txs);
    expect(rows[0]?.category).toBe('nightlife');
    expect(rows[1]?.category).toBe('lebensmittel');
  });

  it('ignores positive amounts (income, refunds)', () => {
    const txs = [
      mkTx({ id: 'a', category: 'einkommen', amount: 1000 }),
      mkTx({ id: 'b', category: 'lebensmittel', amount: -50 }),
    ];
    const rows = aggregateByCategory(txs);
    expect(rows.length).toBe(1);
    expect(rows[0]?.category).toBe('lebensmittel');
  });

  it('returns empty array for empty input', () => {
    expect(aggregateByCategory([])).toEqual([]);
  });

  it('excludes the "umbuchung" category but keeps real "transfer" spending', () => {
    const txs = [
      mkTx({ id: 'a', category: 'lebensmittel', amount: -50 }),
      // own-account move — should NOT count
      mkTx({ id: 'b', category: 'umbuchung', amount: -500, counterparty: 'To Personal Account' }),
      mkTx({ id: 'c', category: 'umbuchung', amount: -1200, counterparty: 'To Instant Access Savings' }),
      // SEPA transfer to a third party (rent) — IS spending
      mkTx({ id: 'd', category: 'transfer', amount: -800, counterparty: 'Miete Vermieter' }),
    ];
    const rows = aggregateByCategory(txs);
    expect(rows.map((r) => r.category).sort()).toEqual(['lebensmittel', 'transfer']);
    expect(rows.find((r) => r.category === 'transfer')!.total).toBe(800);
    expect(rows.find((r) => r.category === 'lebensmittel')!.total).toBe(50);
  });
});
