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

export function parseEurInput(input: string): number | null {
  const cleaned = input.trim().replace(/\s+/g, '').replace(/\./g, '').replace(
    ',',
    '.',
  );
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatPercent(n: number, fractionDigits = 1): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(fractionDigits)} %`;
}
