import { describe, it, expect } from 'vitest';
import { suggestRuleFromChange, normalizeForPattern } from '@/modules/categorization-memory';
import type { CategoryRule } from '@/db/types';

describe('normalizeForPattern', () => {
  it('lowercases and trims', () => {
    expect(normalizeForPattern('  REWE Berlin  ')).toBe('rewe berlin');
  });
  it('collapses whitespace', () => {
    expect(normalizeForPattern('Circle  Club   Berlin')).toBe('circle club berlin');
  });
});

describe('suggestRuleFromChange', () => {
  const existingRules: CategoryRule[] = [
    {
      id: 'r1', counterpartyPattern: 'rewe', matchType: 'regex',
      category: 'lebensmittel', createdBy: 'system', hitCount: 0, lastUsed: null,
      createdAt: '2026-01-01',
    },
  ];

  it('returns suggestion when counterparty has no matching rule yet', () => {
    const r = suggestRuleFromChange({
      counterparty: 'Späti Görli',
      oldCategory: 'restaurants',
      newCategory: 'nightlife',
      existingRules,
    });
    expect(r).not.toBeNull();
    expect(r!.counterpartyPattern.toLowerCase()).toContain('späti');
    expect(r!.category).toBe('nightlife');
  });

  it('returns null when an existing rule already matches the counterparty', () => {
    const r = suggestRuleFromChange({
      counterparty: 'REWE Berlin',
      oldCategory: 'lebensmittel',
      newCategory: 'lebensmittel',
      existingRules,
    });
    expect(r).toBeNull();
  });

  it('returns null when old and new category are identical', () => {
    const r = suggestRuleFromChange({
      counterparty: 'Späti Görli',
      oldCategory: 'nightlife',
      newCategory: 'nightlife',
      existingRules,
    });
    expect(r).toBeNull();
  });

  it('returns null for empty counterparty', () => {
    const r = suggestRuleFromChange({
      counterparty: '',
      oldCategory: 'restaurants',
      newCategory: 'nightlife',
      existingRules,
    });
    expect(r).toBeNull();
  });

  it('produces exact-match pattern by default (not regex)', () => {
    const r = suggestRuleFromChange({
      counterparty: 'Circle Club',
      oldCategory: 'restaurants',
      newCategory: 'nightlife',
      existingRules: [],
    });
    expect(r!.matchType).toBe('exact');
    expect(r!.counterpartyPattern).toBe('circle club');
  });
});
