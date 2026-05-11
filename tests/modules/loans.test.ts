import { describe, it, expect } from 'vitest';
import { buildReturnTransaction } from '@/modules/loans';
import type { Loan } from '@/db/types';

const baseLoan: Loan = {
  id: 'loan-1',
  borrowerName: 'Max',
  itemDescription: 'JBL Box',
  lentAt: '2026-04-10',
  amount: 50,
  paymentMethod: 'transfer',
  status: 'lent',
  createdAt: '2026-04-10T18:00:00Z',
};

describe('buildReturnTransaction', () => {
  it('throws if loan has no amount', () => {
    const { amount, ...rest } = baseLoan;
    expect(() => buildReturnTransaction(rest as Loan, new Date('2026-05-11'))).toThrow();
  });

  it('throws if loan paymentMethod is not transfer', () => {
    expect(() =>
      buildReturnTransaction({ ...baseLoan, paymentMethod: 'cash' }, new Date('2026-05-11'))
    ).toThrow();
  });

  it('builds positive-amount transaction for transfer return', () => {
    const tx = buildReturnTransaction(baseLoan, new Date('2026-05-11T10:00:00Z'));
    expect(tx.amount).toBe(50);
    expect(tx.counterparty).toBe('Max');
    expect(tx.category).toBe('einkommen');
    expect(tx.description).toBe('Rückzahlung: JBL Box');
    expect(tx.date).toBe('2026-05-11');
    expect(tx.sourceCsvId).toBe('manual-loan-return');
    expect(tx.isUserReviewed).toBe(1);
    expect(tx.categoryConfidence).toBe(1);
  });

  it('preserves amount precision', () => {
    const tx = buildReturnTransaction({ ...baseLoan, amount: 42.50 }, new Date('2026-05-11'));
    expect(tx.amount).toBe(42.50);
  });
});
