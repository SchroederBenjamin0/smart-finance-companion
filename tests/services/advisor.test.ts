import { describe, it, expect } from 'vitest';
import { normalizeAndFilter } from '@/services/advisor';
import { findByIsin, isAllowedIsin } from '@/data/tr-universe';

describe('TR_UNIVERSE lookups', () => {
  it('findByIsin returns the matching instrument for a known ISIN', () => {
    const iwda = findByIsin('IE00B4L5Y983');
    expect(iwda).not.toBeNull();
    expect(iwda!.displayName).toContain('MSCI World');
    expect(iwda!.tickerYahoo).toBe('IWDA.AS');
  });

  it('isAllowedIsin is case-insensitive and rejects unknown ISINs', () => {
    expect(isAllowedIsin('ie00b4l5y983')).toBe(true);
    expect(isAllowedIsin('US0000000000')).toBe(false);
    expect(isAllowedIsin('')).toBe(false);
  });
});

describe('advisor normalizeAndFilter', () => {
  it('keeps only allocations whose ISIN is in the TR universe', () => {
    const raw = {
      allocations: [
        // valid — IWDA
        {
          isin: 'IE00B4L5Y983',
          ticker: 'whatever',
          name: 'LLM-Phantasie-Name',
          amount_eur: 230,
          reason: 'Hauptbaustein',
        },
        // invalid — not on the whitelist
        {
          isin: 'US0000000001',
          ticker: 'XXX',
          name: 'Made up',
          amount_eur: 100,
          reason: 'should drop',
        },
      ],
      total_eur: 330,
      drift_warning: null,
      summary: 'mixed',
    };

    const out = normalizeAndFilter(raw);
    expect(out.allocations).toHaveLength(1);
    expect(out.allocations[0]!.isin).toBe('IE00B4L5Y983');
  });

  it('rewrites ticker + display name from the whitelist (not LLM output)', () => {
    const raw = {
      allocations: [
        {
          isin: 'IE00B4L5Y983',
          ticker: 'wrong-ticker',
          name: 'LLM Fantasy Name',
          amount_eur: 100,
          reason: 'x',
        },
      ],
      total_eur: 100,
      summary: '',
    };
    const out = normalizeAndFilter(raw);
    expect(out.allocations[0]!.ticker).toBe('IWDA.AS');
    expect(out.allocations[0]!.name).toBe(
      'iShares Core MSCI World UCITS ETF USD (Acc)',
    );
  });

  it('drops allocations with zero or negative amount', () => {
    const raw = {
      allocations: [
        { isin: 'IE00B4L5Y983', amount_eur: 0, reason: '' },
        { isin: 'IE00BKM4GZ66', amount_eur: -50, reason: '' },
        { isin: 'IE00B53SZB19', amount_eur: 50, reason: '' },
      ],
    };
    const out = normalizeAndFilter(raw);
    expect(out.allocations).toHaveLength(1);
    expect(out.allocations[0]!.isin).toBe('IE00B53SZB19');
  });

  it('falls back to sum of allocations when total_eur is missing', () => {
    const raw = {
      allocations: [
        { isin: 'IE00B4L5Y983', amount_eur: 100, reason: '' },
        { isin: 'IE00BKM4GZ66', amount_eur: 50, reason: '' },
      ],
    };
    const out = normalizeAndFilter(raw);
    expect(out.totalEur).toBe(150);
  });

  it('returns an empty allocations array (and a default summary) for malformed input', () => {
    const out = normalizeAndFilter({});
    expect(out.allocations).toHaveLength(0);
    expect(out.summary).toBeTruthy();
  });
});
