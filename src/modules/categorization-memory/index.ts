import type { CategoryRule, MatchType } from '@/db/types';

export interface SuggestRuleInput {
  counterparty: string;
  oldCategory: string;
  newCategory: string;
  existingRules: CategoryRule[];
}

export interface SuggestedRule {
  counterpartyPattern: string;
  matchType: MatchType;
  category: string;
}

export function normalizeForPattern(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Decides whether to surface a "make this a rule"-suggestion to the user.
 * Returns null when:
 *   - counterparty is empty
 *   - old/new categories are identical (nothing changed)
 *   - an existing rule already matches the counterparty
 *
 * Otherwise returns a rule sketch (exact-match by default).
 */
export function suggestRuleFromChange(input: SuggestRuleInput): SuggestedRule | null {
  if (!input.counterparty.trim()) return null;
  if (input.oldCategory === input.newCategory) return null;

  const normalized = normalizeForPattern(input.counterparty);
  if (!normalized) return null;

  for (const rule of input.existingRules) {
    if (ruleMatches(rule, normalized)) return null;
  }

  return {
    counterpartyPattern: normalized,
    matchType: 'exact',
    category: input.newCategory,
  };
}

function ruleMatches(rule: CategoryRule, normalizedCounterparty: string): boolean {
  if (rule.matchType === 'exact') {
    return rule.counterpartyPattern.toLowerCase() === normalizedCounterparty;
  }
  try {
    return new RegExp(rule.counterpartyPattern, 'i').test(normalizedCounterparty);
  } catch {
    return false;
  }
}
