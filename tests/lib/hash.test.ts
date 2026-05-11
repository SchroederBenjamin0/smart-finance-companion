import { describe, it, expect } from 'vitest';
import { computeTransactionHash, normalizeCounterparty } from '@/lib/hash';

describe('normalizeCounterparty', () => {
  it('lowercases input', () => {
    expect(normalizeCounterparty('REWE')).toBe('rewe');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeCounterparty('REWE  Berlin   Mitte')).toBe('rewe berlin mitte');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeCounterparty('  Lidl  ')).toBe('lidl');
  });

  it('handles empty string', () => {
    expect(normalizeCounterparty('')).toBe('');
  });

  it('handles unicode', () => {
    expect(normalizeCounterparty('Spätkauf Görli')).toBe('spätkauf görli');
  });
});

describe('computeTransactionHash', () => {
  it('produces deterministic hex of length 64 (SHA-256)', async () => {
    const hash = await computeTransactionHash({
      date: '2026-05-10',
      amount: -12.50,
      counterparty: 'REWE',
    });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe('4687b8b83c833eab44097acb32cf1c0c903dded9171abdca9bf31062fd3f7f1e');
  });

  it('produces identical hashes for identical normalized inputs', async () => {
    const h1 = await computeTransactionHash({
      date: '2026-05-10',
      amount: -12.50,
      counterparty: 'REWE',
    });
    const h2 = await computeTransactionHash({
      date: '2026-05-10',
      amount: -12.50,
      counterparty: '  rewe  ',
    });
    expect(h1).toBe(h2);
  });

  it('differs when date differs', async () => {
    const h1 = await computeTransactionHash({
      date: '2026-05-10',
      amount: -12.50,
      counterparty: 'REWE',
    });
    const h2 = await computeTransactionHash({
      date: '2026-05-11',
      amount: -12.50,
      counterparty: 'REWE',
    });
    expect(h1).not.toBe(h2);
  });

  it('differs when amount differs by 1 cent', async () => {
    const h1 = await computeTransactionHash({
      date: '2026-05-10',
      amount: -12.50,
      counterparty: 'REWE',
    });
    const h2 = await computeTransactionHash({
      date: '2026-05-10',
      amount: -12.51,
      counterparty: 'REWE',
    });
    expect(h1).not.toBe(h2);
  });

  it('handles positive amounts (refunds, income)', async () => {
    const hash = await computeTransactionHash({
      date: '2026-05-10',
      amount: 250.00,
      counterparty: 'DJ Gig Berghain',
    });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uses cents-precision (12.50 ≠ 12.501 — but rounded the same)', async () => {
    const h1 = await computeTransactionHash({
      date: '2026-05-10',
      amount: -12.501,
      counterparty: 'REWE',
    });
    const h2 = await computeTransactionHash({
      date: '2026-05-10',
      amount: -12.50,
      counterparty: 'REWE',
    });
    expect(h1).toBe(h2);
  });
});
