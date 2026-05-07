import { describe, it, expect } from 'vitest';
import { parseHoldings, parseLines } from '@/services/trPdfImport';

const realPdfLines = [
  'TRADE REPUBLIC BANK GMBH',
  'BENJAMIN OCTAVIO SCHROEDER',
  'DATUM 07.05.2026',
  'DEPOT 0734851101',
  'VERMÖGENSÜBERSICHT',
  'zum 07.05.2026',
  'PORTFOLIO KURSWERT IN EUR',
  'Brokerage 861,75',
  'Cash 1,79',
  'GESAMT 863,54 EUR',
  'BROKERAGE',
  'STK. / NOMINALE WERTPAPIERBEZEICHNUNG KURS PRO STÜCK KURSWERT IN EUR',
  '2,48793 Stk.',
  'DAX EUR (Acc)',
  'ISIN: LU0252633754',
  '226,70',
  '07.05.2026',
  '564,01',
  '17,991663 Stk.',
  'thyssenkrupp AG',
  'Inhaber-Aktien o.N.',
  'ISIN: DE0007500001',
  '11,12',
  '07.05.2026',
  '200,07',
  '0,525373 Stk.',
  'NVIDIA Corp.',
  'Registered Shares DL-,001',
  'ISIN: US67066G1040',
  '177,24',
  '07.05.2026',
  '93,12',
  '2 Stk.',
  'DroneShield Limited',
  'Registered Shares o.N.',
  'ISIN: AU000000DRO2',
  '2,28',
  '07.05.2026',
  '4,55',
  'ANZAHL POSITIONEN: 4 861,75 EUR',
];

describe('TR PDF parser', () => {
  it('extracts totals and date', () => {
    const r = parseLines(realPdfLines);
    expect(r.date).toBe('07.05.2026');
    expect(r.brokerage).toBe(861.75);
    expect(r.cash).toBe(1.79);
    expect(r.total).toBe(863.54);
  });

  it('extracts all 4 holdings with shares, price, value', () => {
    const r = parseLines(realPdfLines);
    expect(r.holdings).toHaveLength(4);

    const dax = r.holdings[0]!;
    expect(dax.isin).toBe('LU0252633754');
    expect(dax.shares).toBeCloseTo(2.48793, 5);
    expect(dax.pricePerShare).toBe(226.7);
    expect(dax.currentValue).toBe(564.01);
    expect(dax.name).toContain('DAX');
    expect(dax.assetType).toBe('etf');

    const tka = r.holdings[1]!;
    expect(tka.isin).toBe('DE0007500001');
    expect(tka.shares).toBeCloseTo(17.991663, 5);
    expect(tka.pricePerShare).toBe(11.12);
    expect(tka.currentValue).toBe(200.07);
    expect(tka.name).toContain('thyssenkrupp');
    expect(tka.assetType).toBe('stock');

    const nvda = r.holdings[2]!;
    expect(nvda.isin).toBe('US67066G1040');
    expect(nvda.shares).toBeCloseTo(0.525373, 5);
    expect(nvda.pricePerShare).toBe(177.24);
    expect(nvda.currentValue).toBe(93.12);
    expect(nvda.name).toContain('NVIDIA');

    const dro = r.holdings[3]!;
    expect(dro.isin).toBe('AU000000DRO2');
    expect(dro.shares).toBe(2);
    expect(dro.pricePerShare).toBe(2.28);
    expect(dro.currentValue).toBe(4.55);
    expect(dro.name).toContain('DroneShield');
  });

  it('also handles the inline (single-line) variant', () => {
    const inline = [
      '2,48793 Stk. DAX EUR (Acc) ISIN: LU0252633754 226,70 07.05.2026 564,01',
    ];
    const holdings = parseHoldings(inline.join(' '));
    expect(holdings).toHaveLength(1);
    expect(holdings[0]!.shares).toBeCloseTo(2.48793, 5);
    expect(holdings[0]!.currentValue).toBe(564.01);
  });

  it('survives kerning-split numbers like "0, 525373"', () => {
    const text =
      '0, 525373 Stk. NVIDIA Corp. Registered Shares DL-,001 ISIN: US67066G1040 177,24 07.05.2026 93,12';
    const holdings = parseHoldings(text);
    expect(holdings).toHaveLength(1);
    expect(holdings[0]!.shares).toBeCloseTo(0.525373, 5);
  });
});
