import { describe, it, expect } from 'vitest';
import { detectAnomalies } from '@/modules/anomaly';
import type { Transaction } from '@/db/types';

function mkTx(d: Partial<Transaction>): Transaction {
  return {
    id: '1', date: '2026-05-01', amount: -10, counterparty: 'X',
    description: null, category: 'lebensmittel', categoryConfidence: 1,
    isUserReviewed: 0, sourceCsvId: 'csv', importedAt: '2026-05-01',
    transactionHash: 'h', isAnomaly: 0, ...d,
  };
}

describe('detectAnomalies', () => {
  it('flags 3x median + >50€ as anomalous', () => {
    const historical = Array.from({ length: 12 }, (_, i) =>
      mkTx({ id: `h${i}`, date: `2026-0${(i % 9) + 1}-15`, amount: -25, category: 'lebensmittel' })
    );
    const newTxs = [mkTx({ id: 'n1', amount: -120, category: 'lebensmittel' })];
    const r = detectAnomalies(newTxs, historical);
    expect(r.length).toBe(1);
    expect(r[0]?.txId).toBe('n1');
  });

  it('does not flag small amounts even if >3x median', () => {
    const historical = Array.from({ length: 12 }, (_, i) =>
      mkTx({ id: `h${i}`, date: `2026-0${(i % 9) + 1}-15`, amount: -5, category: 'kleidung' })
    );
    const newTxs = [mkTx({ id: 'n1', amount: -30, category: 'kleidung' })];
    expect(detectAnomalies(newTxs, historical)).toEqual([]);
  });

  it('does not flag if less than 6 months historical data in category', () => {
    const historical = [mkTx({ id: 'h1', date: '2026-04-01', amount: -10, category: 'sonstiges' })];
    const newTxs = [mkTx({ id: 'n1', amount: -200, category: 'sonstiges' })];
    expect(detectAnomalies(newTxs, historical)).toEqual([]);
  });

  it('returns multiple anomalies if multiple new txs exceed thresholds', () => {
    const historical = Array.from({ length: 20 }, (_, i) =>
      mkTx({ id: `h${i}`, date: `2026-0${(i % 9) + 1}-15`, amount: -30, category: 'nightlife' })
    );
    const newTxs = [
      mkTx({ id: 'n1', amount: -150, category: 'nightlife' }),
      mkTx({ id: 'n2', amount: -200, category: 'nightlife' }),
    ];
    expect(detectAnomalies(newTxs, historical).length).toBe(2);
  });
});
