import { describe, it, expect } from 'vitest';
import { isInternalTransfer, isNonSpending } from '@/modules/spending';

describe('isInternalTransfer', () => {
  it('is true only for umbuchung', () => {
    expect(isInternalTransfer('umbuchung')).toBe(true);
    expect(isInternalTransfer('transfer')).toBe(false);
    expect(isInternalTransfer('lebensmittel')).toBe(false);
  });

  it('umbuchung counts as non-spending, transfer does not', () => {
    expect(isNonSpending('umbuchung')).toBe(true);
    expect(isNonSpending('transfer')).toBe(false);
  });
});
