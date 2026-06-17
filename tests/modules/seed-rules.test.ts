import { describe, it, expect } from 'vitest';
import {
  INTERNAL_TRANSFER_PATTERNS,
  matchesInternalTransfer,
} from '@/modules/categorizer/seedRules';

describe('INTERNAL_TRANSFER_PATTERNS', () => {
  it('matches the common Revolut own-account descriptions', () => {
    expect(matchesInternalTransfer('To Personal Account')).toBe(true);
    expect(matchesInternalTransfer('From Personal Account')).toBe(true);
    expect(matchesInternalTransfer('To Instant Access Savings')).toBe(true);
    expect(matchesInternalTransfer('From Instant Access Savings')).toBe(true);
    expect(matchesInternalTransfer('To Instant Savings')).toBe(true);
    expect(matchesInternalTransfer('From Instant Savings')).toBe(true);
    expect(matchesInternalTransfer('to instant savings')).toBe(true);
    expect(matchesInternalTransfer('To Savings Vault')).toBe(true);
    expect(matchesInternalTransfer('From Savings')).toBe(true);
    expect(matchesInternalTransfer('To Vault Holiday Fund')).toBe(true);
    expect(matchesInternalTransfer('Übertrag zu Sparkonto')).toBe(true);
  });

  it('rejects payments to third parties', () => {
    expect(matchesInternalTransfer('Miete Vermieter Müller')).toBe(false);
    expect(matchesInternalTransfer('Hannah K. (Pizza)')).toBe(false);
    expect(matchesInternalTransfer('REWE Berlin Friedrichstraße')).toBe(false);
    // Bare "Transfer" without context is ambiguous — we err on the side of
    // treating it as a third-party payment.
    expect(matchesInternalTransfer('Transfer received')).toBe(false);
  });

  it('exposes the raw pattern list for re-use by migrations', () => {
    expect(INTERNAL_TRANSFER_PATTERNS.length).toBeGreaterThan(0);
    expect(INTERNAL_TRANSFER_PATTERNS).toContain('^(To|From) Personal Account$');
  });
});
