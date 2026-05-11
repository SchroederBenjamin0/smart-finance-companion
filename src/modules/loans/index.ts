import { generateId } from '@/lib/id';
import type { Loan } from '@/db/types';

export interface ReturnTransactionInput {
  id: string;
  date: string;
  amount: number;
  counterparty: string;
  description: string;
  category: 'einkommen';
  categoryConfidence: 1;
  isUserReviewed: 1;
  sourceCsvId: 'manual-loan-return';
  importedAt: string;
}

/**
 * Builds a positive transaction for a returned loan (transfer payment).
 * The hash + isAnomaly fields are added by the caller before insert.
 * Throws if the loan was cash-only or has no recoverable amount — the
 * caller should branch on paymentMethod before invoking this.
 */
export function buildReturnTransaction(loan: Loan, now: Date): ReturnTransactionInput {
  if (loan.amount === undefined || loan.amount <= 0) {
    throw new Error('buildReturnTransaction requires a positive loan amount');
  }
  if (loan.paymentMethod !== 'transfer') {
    throw new Error('buildReturnTransaction only handles transfer-method returns');
  }
  const date = now.toISOString().slice(0, 10);
  return {
    id: generateId(),
    date,
    amount: loan.amount,
    counterparty: loan.borrowerName,
    description: `Rückzahlung: ${loan.itemDescription}`,
    category: 'einkommen',
    categoryConfidence: 1,
    isUserReviewed: 1,
    sourceCsvId: 'manual-loan-return',
    importedAt: now.toISOString(),
  };
}
