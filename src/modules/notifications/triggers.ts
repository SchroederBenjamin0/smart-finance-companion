import type { IncomeEntry, InvestmentPosition, Subscription } from '@/db/types';

// ---------- Dedupe-Key-Builder ----------

export function buildAllocationDedupeKey(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `allocation-${y}-${m}`;
}

export function buildSubscriptionDedupeKey(id: string, nextBillDate: string): string {
  return `sub-${id}-${nextBillDate}`;
}

export function buildDriftDedupeKey(positionId: string, now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `drift-${positionId}-${y}-${m}`;
}

export function buildCashflowDedupeKey(now: Date): string {
  const { year, week } = getIsoWeek(now);
  return `cashflow-${year}-W${String(week).padStart(2, '0')}`;
}

export function buildAnomalyDedupeKey(csvImportId: string): string {
  return `anomaly-${csvImportId}`;
}

function getIsoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

// ---------- Trigger-Conditions ----------

export interface AllocationCheckInput {
  now: Date;
  incomeEntriesThisMonth: IncomeEntry[];
}

export interface AllocationCheckResult {
  shouldFire: boolean;
  overdueDays: number;
}

export function shouldFireAllocation(input: AllocationCheckInput): AllocationCheckResult {
  if (input.incomeEntriesThisMonth.length > 0) {
    return { shouldFire: false, overdueDays: 0 };
  }
  const day = input.now.getUTCDate();
  return { shouldFire: true, overdueDays: Math.max(0, day - 1) };
}

export interface SubscriptionCheckResult {
  shouldFire: boolean;
  daysUntil: number;
}

export function shouldFireSubscription(sub: Subscription, now: Date): SubscriptionCheckResult {
  if (sub.isActive !== 1) return { shouldFire: false, daysUntil: -1 };
  const due = new Date(sub.nextBillDate);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dueUtc = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()));
  const diffMs = dueUtc.getTime() - today.getTime();
  const daysUntil = Math.round(diffMs / (24 * 60 * 60 * 1000));
  const shouldFire = daysUntil >= 0 && daysUntil <= 3;
  return { shouldFire, daysUntil };
}

export interface DriftCheckResult {
  shouldFire: boolean;
  deltaPp: number;
}

export function shouldFireDrift(
  pos: InvestmentPosition,
  currentWeightPercent: number,
  tolerancePp: number,
): DriftCheckResult {
  if (pos.targetPercentage <= 0) return { shouldFire: false, deltaPp: 0 };
  const deltaPp = currentWeightPercent - pos.targetPercentage;
  return { shouldFire: Math.abs(deltaPp) > tolerancePp, deltaPp };
}

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
    else if (point.funBalance < yellowThreshold && !earliestYellow) earliestYellow = point.weekStartIso;
  }

  if (earliestRed) return { shouldFire: true, severity: 'red', earliestWeek: earliestRed };
  if (earliestYellow) return { shouldFire: true, severity: 'yellow', earliestWeek: earliestYellow };
  return { shouldFire: false, severity: null, earliestWeek: null };
}
