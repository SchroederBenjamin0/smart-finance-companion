import type { Account, IncomeEntry, Subscription, Transaction } from '@/db/types';

// ---------- shouldFireCashflow (moved from notifications/triggers) ----------

export interface CashflowForecastPoint {
  weekStartIso: string;
  funBalance: number;
}

export interface CashflowCheckResult {
  shouldFire: boolean;
  severity: 'yellow' | 'red' | null;
  earliestWeek: string | null;
}

export function shouldFireCashflow(
  forecast: CashflowForecastPoint[],
  yellowThreshold: number,
): CashflowCheckResult {
  let earliestRed: string | null = null;
  let earliestYellow: string | null = null;

  for (const point of forecast.slice(0, 5)) { // 5 wks = ~30 days
    if (point.funBalance < 0 && !earliestRed) earliestRed = point.weekStartIso;
    if (point.funBalance >= 0 && point.funBalance < yellowThreshold && !earliestYellow) {
      earliestYellow = point.weekStartIso;
    }
  }

  if (earliestRed) return { shouldFire: true, severity: 'red', earliestWeek: earliestRed };
  if (earliestYellow) return { shouldFire: true, severity: 'yellow', earliestWeek: earliestYellow };
  return { shouldFire: false, severity: null, earliestWeek: null };
}

// ---------- forecastCashflow ----------

export interface ForecastInput {
  accounts: Account[];
  subscriptions: Subscription[];
  transactions: Transaction[];
  incomeEntries: IncomeEntry[];
  weeks: number;
  now: Date;
}

export interface ForecastEvent {
  type: 'subscription' | 'expected_income' | 'variable_expense';
  amount: number;
  label: string;
}

export interface WeeklyForecast {
  weekStartIso: string;
  funBalance: number;
  savingsBalance: number;
  investmentBalance: number;
  events: ForecastEvent[];
}

export function forecastCashflow(input: ForecastInput): WeeklyForecast[] {
  const fun = input.accounts.find((a) => a.type === 'fun');
  const savings = input.accounts.find((a) => a.type === 'savings');
  const investment = input.accounts.find((a) => a.type === 'investment');

  let funBalance = fun?.balance ?? 0;
  let savingsBalance = savings?.balance ?? 0;
  let investmentBalance = investment?.balance ?? 0;

  // Variable spending: weekly median over last 90 days
  const cutoff90 = isoDateDaysAgo(input.now, 90);
  const recentExpenses = input.transactions.filter((t) => t.amount < 0 && t.date >= cutoff90);
  const weeklyVariableSpend = computeWeeklyMedianSpend(recentExpenses);

  // Expected weekly income (median per-week over last 90d income entries)
  const cutoffIncome = isoDateDaysAgo(input.now, 90);
  const recentIncome = input.incomeEntries.filter((e) => e.date >= cutoffIncome);
  // distribute 90d income across 13 weeks (approx)
  const weeklyExpectedIncome = recentIncome.reduce((s, e) => s + e.amount, 0) / 13;

  const results: WeeklyForecast[] = [];
  for (let w = 0; w < input.weeks; w++) {
    const weekStart = addDays(input.now, w * 7);
    const weekEnd = addDays(input.now, (w + 1) * 7);
    const weekStartIso = weekStart.toISOString().slice(0, 10);
    const weekEndIso = weekEnd.toISOString().slice(0, 10);

    const events: ForecastEvent[] = [];

    // Subscriptions due in this week (debited from fun for simplicity — actual app
    // logic may route to different accounts, but Fun is the cashflow-sensitive one)
    const subsThisWeek = input.subscriptions.filter(
      (s) => s.isActive === 1 && s.nextBillDate >= weekStartIso && s.nextBillDate < weekEndIso,
    );
    for (const s of subsThisWeek) {
      events.push({ type: 'subscription', amount: -s.amount, label: s.name });
      funBalance -= s.amount;
    }

    if (weeklyExpectedIncome > 0) {
      events.push({ type: 'expected_income', amount: weeklyExpectedIncome, label: 'Erwartet (Median)' });
      // Apply default 30/30/40 allocation split to expected income
      funBalance += weeklyExpectedIncome * 0.3;
      savingsBalance += weeklyExpectedIncome * 0.3;
      investmentBalance += weeklyExpectedIncome * 0.4;
    }

    if (weeklyVariableSpend > 0) {
      events.push({ type: 'variable_expense', amount: -weeklyVariableSpend, label: 'Variable Ausgaben' });
      funBalance -= weeklyVariableSpend;
    }

    results.push({
      weekStartIso,
      funBalance: round2(funBalance),
      savingsBalance: round2(savingsBalance),
      investmentBalance: round2(investmentBalance),
      events,
    });
  }
  return results;
}

function isoDateDaysAgo(now: Date, days: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeWeeklyMedianSpend(expenses: Transaction[]): number {
  if (expenses.length === 0) return 0;
  const byWeek = new Map<string, number>();
  for (const e of expenses) {
    const week = isoWeekKey(new Date(e.date));
    byWeek.set(week, (byWeek.get(week) ?? 0) + Math.abs(e.amount));
  }
  const totals = Array.from(byWeek.values()).sort((a, b) => a - b);
  if (totals.length === 0) return 0;
  const mid = Math.floor(totals.length / 2);
  return totals.length % 2 === 0 ? (totals[mid - 1]! + totals[mid]!) / 2 : totals[mid]!;
}

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
