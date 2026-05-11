export function normalizeCounterparty(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface HashInput {
  date: string;
  amount: number;
  counterparty: string;
}

export async function computeTransactionHash(input: HashInput): Promise<string> {
  const cents = Math.round(input.amount * 100);
  // FROZEN canonical format: changing this invalidates all stored transaction hashes.
  const normalized = `${input.date}|${cents}|${normalizeCounterparty(input.counterparty)}`;
  const buf = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
