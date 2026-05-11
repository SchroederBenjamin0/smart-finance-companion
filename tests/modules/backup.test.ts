import { describe, it, expect } from 'vitest';
import { backupBlobFromData, validateBackupShape } from '@/modules/backup';

describe('backupBlobFromData', () => {
  it('builds a versioned blob with expected stores', () => {
    const blob = backupBlobFromData(
      {
        transactions: [],
        accounts: [],
        allocations: [],
        incomeEntries: [],
        subscriptions: [],
        categoryRules: [],
        investmentPositions: [],
        loans: [],
        recommendations: [],
        appConfig: [],
      },
      new Date('2026-05-11T10:00:00Z'),
    );
    expect(blob.version).toBe(1);
    expect(blob.exportedAt).toBe('2026-05-11T10:00:00.000Z');
    expect(Object.keys(blob.data)).toContain('transactions');
    expect(Object.keys(blob.data)).not.toContain('secrets');
  });
});

describe('validateBackupShape', () => {
  it('rejects wrong version', () => {
    expect(validateBackupShape({ version: 99 }).ok).toBe(false);
  });
  it('rejects missing keys', () => {
    expect(validateBackupShape({ version: 1, exportedAt: 'x' }).ok).toBe(false);
  });
  it('accepts valid blob', () => {
    const valid = {
      version: 1,
      exportedAt: 'x',
      data: {
        transactions: [],
        accounts: [],
        allocations: [],
        incomeEntries: [],
        subscriptions: [],
        categoryRules: [],
        investmentPositions: [],
        loans: [],
        recommendations: [],
        appConfig: [],
      },
    };
    expect(validateBackupShape(valid).ok).toBe(true);
  });
  it('rejects null input', () => {
    expect(validateBackupShape(null).ok).toBe(false);
  });
  it('rejects non-array data field', () => {
    const bad = {
      version: 1,
      exportedAt: 'x',
      data: {
        transactions: 'not-array',
        accounts: [],
        allocations: [],
        incomeEntries: [],
        subscriptions: [],
        categoryRules: [],
        investmentPositions: [],
        loans: [],
        recommendations: [],
        appConfig: [],
      },
    };
    expect(validateBackupShape(bad).ok).toBe(false);
  });
});
