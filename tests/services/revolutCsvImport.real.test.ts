import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { parseRevolutCsv } from '@/services/revolutCsvImport';

const REAL_CSV_PATH = '/tmp/sample-revolut.csv';

const skipReal = !existsSync(REAL_CSV_PATH);

describe.skipIf(skipReal)('parseRevolutCsv against the real April statement', () => {
  it('parses the actual user statement without errors', async () => {
    const text = readFileSync(REAL_CSV_PATH, 'utf8');
    const file = new File([text], 'statement.csv', { type: 'text/csv' });
    const r = await parseRevolutCsv(file);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.transactions.length).toBeGreaterThan(0);
    expect(r.value.periodStart).toMatch(/^2026-04-\d{2}$/);
    expect(r.value.periodEnd).toMatch(/^2026-04-\d{2}$/);
    // Sanity: every transaction has a valid date + finite amount
    for (const t of r.value.transactions) {
      expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isFinite(t.amount)).toBe(true);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });
});
