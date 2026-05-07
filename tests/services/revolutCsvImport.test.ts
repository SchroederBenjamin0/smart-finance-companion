import { describe, it, expect } from 'vitest';
import { parseRevolutCsv } from '@/services/revolutCsvImport';

function fakeCsv(text: string): File {
  return new File([text], 'statement.csv', { type: 'text/csv' });
}

const SAMPLE = `"Current Accounts Summaries",,,,,,,
,,,,,,,
"Personal Account (EUR)",,,,,,,
,,,,,,,
"Current account details",,,,,,,
,,,,,,,
"Current Accounts Transaction Statements",,,,,,,
,,,,,,,
"Personal Account (EUR)",,,,,,,
,,,,,,,
"Transaction statement",,,,,,,
Date,Description,Category,"Money in/out",Balance,"Tax withheld","Other taxes",Fees
"Apr 2, 2026","Top-up by *6825","Top up",€50.00,€85.34,€0.00,€0.00,€0.00
"Apr 3, 2026",EDEKA,Merchant,-€18.88,€39.98,€0.00,€0.00,€0.00
"Apr 5, 2026","Uebel & Gefährlich",Merchant,-€11.00,€0.56,€0.00,€0.00,€0.00
"Apr 8, 2026","Top-up by *6825","Top up",€240.00,€240.56,€0.00,€0.00,€0.00
,,,,,,,
"Savings Accounts Transaction Statements",,,,,,,
,,,,,,,
"Savings (EUR)",,,,,,,
,,,,,,,
"Transaction statement",,,,,,,
Date,Description,Category,"Money in/out",Balance,"Tax withheld","Other taxes",Fees
"Apr 9, 2026","To Personal Account",Others,-€2.00,€12.92,€0.00,€0.00,€0.00
`;

describe('parseRevolutCsv', () => {
  it('extracts transactions from current and savings sections', async () => {
    const r = await parseRevolutCsv(fakeCsv(SAMPLE));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.transactions).toHaveLength(5);
    const t1 = r.value.transactions[0]!;
    expect(t1.date).toBe('2026-04-02');
    expect(t1.description).toBe('Top-up by *6825');
    expect(t1.amount).toBe(50);
    expect(t1.account).toBe('current');

    const edeka = r.value.transactions[1]!;
    expect(edeka.description).toBe('EDEKA');
    expect(edeka.amount).toBe(-18.88);

    const savings = r.value.transactions[4]!;
    expect(savings.account).toBe('savings');
    expect(savings.amount).toBe(-2);
  });

  it('reports period start and end', async () => {
    const r = await parseRevolutCsv(fakeCsv(SAMPLE));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.periodStart).toBe('2026-04-02');
    expect(r.value.periodEnd).toBe('2026-04-09');
  });

  it('handles money formats with thousands separators', async () => {
    const csv = `"Personal Account (EUR)",,,,,,,
"Transaction statement",,,,,,,
Date,Description,Category,"Money in/out",Balance,"Tax withheld","Other taxes",Fees
"Apr 1, 2026","Salary","Top up","€2,400.00","€2,400.00",€0.00,€0.00,€0.00
`;
    const r = await parseRevolutCsv(fakeCsv(csv));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.transactions[0]!.amount).toBe(2400);
  });
});
