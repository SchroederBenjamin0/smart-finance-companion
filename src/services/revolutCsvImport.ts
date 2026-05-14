import Papa from 'papaparse';
import { tryAsync, type Result } from '@/lib/result';

export interface RevolutTxn {
  date: string;
  description: string;
  revolutCategory: string;
  amount: number;
  balance: number;
  account: 'current' | 'savings';
}

export interface ParsedRevolutCsv {
  periodStart: string;
  periodEnd: string;
  transactions: RevolutTxn[];
  /**
   * Latest known balance per Revolut account, derived from the last booking
   * (by date, with file order as tiebreaker) in each section. These mirror
   * what the user sees in the Revolut app and are the authoritative balances
   * for the corresponding Fun / Sparkonto buckets.
   */
  finalBalances: {
    current: number | null;
    savings: number | null;
  };
}

const MONTH_INDEX: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

const REVOLUT_DATE = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/;

function parseRevolutDate(s: string): string | null {
  const m = REVOLUT_DATE.exec(s.trim());
  if (!m) return null;
  const month = MONTH_INDEX[m[1]!];
  if (month === undefined) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (!Number.isFinite(day) || !Number.isFinite(year)) return null;
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

const MONEY = /^(-?)€(-?)([\d.,]+)$/;

function parseMoney(s: string): number | null {
  const cleaned = s.trim();
  if (!cleaned) return null;
  const m = MONEY.exec(cleaned);
  if (!m) return null;
  const sign = m[1] === '-' || m[2] === '-' ? -1 : 1;
  const numStr = m[3]!.replace(/,/g, '');
  const v = Number(numStr);
  if (!Number.isFinite(v)) return null;
  return sign * v;
}

export async function parseRevolutCsv(
  file: File,
): Promise<Result<ParsedRevolutCsv>> {
  return tryAsync(async () => {
    const text = await file.text();
    const result = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: false,
    });
    const rows = result.data;

    let currentAccount: 'current' | 'savings' = 'current';
    const transactions: RevolutTxn[] = [];
    let periodStart = '';
    let periodEnd = '';

    interface LatestBalance {
      date: string;
      rowIdx: number;
      balance: number;
    }
    const latest: Record<'current' | 'savings', LatestBalance | null> = {
      current: null,
      savings: null,
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const first = (row[0] ?? '').trim();
      const second = (row[1] ?? '').trim();

      if (first === 'Personal Account (EUR)') currentAccount = 'current';
      else if (/^Savings/i.test(first)) currentAccount = 'savings';

      if (first === 'Date' && (row[1] ?? '').trim() === 'Description') continue;

      const date = parseRevolutDate(first);
      if (!date) continue;
      const description = second;
      const revolutCategory = (row[2] ?? '').trim() || 'Uncategorized';
      const amount = parseMoney(row[3] ?? '');
      const parsedBalance = parseMoney(row[4] ?? '');
      const balance = parsedBalance ?? 0;
      if (amount === null) continue;

      transactions.push({
        date,
        description,
        revolutCategory,
        amount,
        balance,
        account: currentAccount,
      });

      if (parsedBalance !== null) {
        const prev = latest[currentAccount];
        if (
          !prev ||
          date > prev.date ||
          (date === prev.date && i > prev.rowIdx)
        ) {
          latest[currentAccount] = { date, rowIdx: i, balance: parsedBalance };
        }
      }

      if (!periodStart || date < periodStart) periodStart = date;
      if (!periodEnd || date > periodEnd) periodEnd = date;
    }

    return {
      periodStart,
      periodEnd,
      transactions,
      finalBalances: {
        current: latest.current ? latest.current.balance : null,
        savings: latest.savings ? latest.savings.balance : null,
      },
    };
  });
}
