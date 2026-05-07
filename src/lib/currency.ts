const eurFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const eurFormatterNoSign = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatEur = (n: number): string => eurFormatter.format(n);

export const formatEurNoSign = (n: number): string =>
  eurFormatterNoSign.format(n);

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Parse a user-entered amount, accepting both comma and dot as decimal
 * separators. The last separator wins; earlier ones are treated as
 * thousands grouping. Examples:
 *   "12,50"      → 12.5     (German decimal)
 *   "12.50"      → 12.5     (US/dot decimal)
 *   "1.234,56"   → 1234.56  (German with grouping)
 *   "1,234.56"   → 1234.56  (US with grouping)
 *   "12.345"     → 12345    (no decimal — treated as thousands)
 *   "12,345"     → 12345    (same)
 *   "12.34.56"   → null     (ambiguous)
 */
export function parseEurInput(input: string): number | null {
  const trimmed = input.trim().replace(/\s+/g, '');
  if (trimmed === '') return null;

  const lastComma = trimmed.lastIndexOf(',');
  const lastDot = trimmed.lastIndexOf('.');

  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = trimmed;
  } else if (lastComma > lastDot) {
    // Comma is the decimal separator → strip dots, swap comma to dot
    normalized = trimmed.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // Dot is the decimal separator → strip commas
    normalized = trimmed.replace(/,/g, '');
  } else {
    return null;
  }

  // After normalization there must be at most one dot.
  if ((normalized.match(/\./g) ?? []).length > 1) return null;

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function formatPercent(n: number, fractionDigits = 1): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(fractionDigits)} %`;
}
