import { priceCacheRepo } from '@/db/repositories/priceCache';
import { ok, err, type Result } from '@/lib/result';
import type { PriceCachePoint, PriceCacheEntry } from '@/db/types';

export interface BacktestAllocation {
  ticker: string;
  weight: number; // 0..1
}

export interface BacktestInput {
  allocation: BacktestAllocation[];
  monthlyContribution: number;
  years: number;
}

export interface BacktestSeriesPoint {
  date: string;
  value: number;
}

export interface BacktestResult {
  series: BacktestSeriesPoint[];
  endValue: number;
  maxDrawdown: number;
  totalContributed: number;
}

export function computeMaxDrawdown(series: BacktestSeriesPoint[]): number {
  let peak = 0;
  let maxDrawdown = 0;
  for (const p of series) {
    if (p.value > peak) peak = p.value;
    if (peak > 0) {
      const dd = (peak - p.value) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
  }
  return maxDrawdown;
}

/**
 * Async orchestrator: gathers monthly closes per ticker (cached or fresh),
 * simulates DCA with the allocation weights, returns the full backtest result.
 */
export async function runBacktest(input: BacktestInput): Promise<Result<BacktestResult>> {
  const tickerCloses = new Map<string, PriceCachePoint[]>();

  for (const a of input.allocation) {
    const cached = await priceCacheRepo.get(a.ticker);
    if (cached.ok && cached.value) {
      tickerCloses.set(a.ticker, cached.value.monthlyCloses);
      continue;
    }
    const fetchR = await fetchMonthlyCloses(a.ticker, input.years);
    if (!fetchR.ok) return err(fetchR.error);
    const entry: PriceCacheEntry = {
      ticker: a.ticker,
      monthlyCloses: fetchR.value,
      fetchedAt: new Date().toISOString(),
    };
    await priceCacheRepo.upsert(entry);
    tickerCloses.set(a.ticker, fetchR.value);
  }

  const minLen = Math.min(...Array.from(tickerCloses.values()).map((c) => c.length));
  if (minLen === 0) return err(new Error('No price data available for backtest'));

  const aggregated: BacktestSeriesPoint[] = [];
  let totalContributed = 0;
  const shares = new Map<string, number>();

  for (let i = 0; i < minLen; i++) {
    const monthContribution = input.monthlyContribution;
    totalContributed += monthContribution;
    let portfolioValue = 0;
    let dateOfMonth = '';
    for (const a of input.allocation) {
      const series = tickerCloses.get(a.ticker)!;
      const point = series[i]!;
      dateOfMonth = point.date;
      if (point.close > 0) {
        const newShares = (monthContribution * a.weight) / point.close;
        const prevShares = shares.get(a.ticker) ?? 0;
        shares.set(a.ticker, prevShares + newShares);
      }
      const current = (shares.get(a.ticker) ?? 0) * point.close;
      portfolioValue += current;
    }
    aggregated.push({ date: dateOfMonth, value: Math.round(portfolioValue * 100) / 100 });
  }

  const endValue = aggregated.length > 0 ? aggregated[aggregated.length - 1]!.value : 0;
  const maxDrawdown = computeMaxDrawdown(aggregated);

  return ok({ series: aggregated, endValue, maxDrawdown, totalContributed });
}

const CHART_ENDPOINT = 'https://query1.finance.yahoo.com/v8/finance/chart';

/**
 * Fetches monthly close prices for a ticker via Yahoo Finance v8 chart API.
 * Mirrors the CORS-proxy fallback pattern used in src/services/yahoo.ts.
 */
async function fetchMonthlyCloses(
  ticker: string,
  years: number,
): Promise<Result<PriceCachePoint[]>> {
  const target = `${CHART_ENDPOINT}/${encodeURIComponent(ticker)}?range=${years}y&interval=1mo`;
  const attempts: string[] = [
    target,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(target)}`,
  ];

  for (const url of attempts) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = (await res.json()) as unknown;
      const root = (
        data as { chart?: { result?: Array<Record<string, unknown>> } }
      ).chart?.result?.[0];
      if (!root) continue;
      const ts = (root as { timestamp?: number[] }).timestamp ?? [];
      const closes = (
        root as {
          indicators?: { quote?: Array<{ close?: (number | null)[] }> };
        }
      ).indicators?.quote?.[0]?.close ?? [];
      const points: PriceCachePoint[] = [];
      for (let i = 0; i < ts.length; i++) {
        const close = closes[i];
        if (typeof close !== 'number' || close <= 0) continue;
        const date = new Date(ts[i]! * 1000).toISOString().slice(0, 10);
        points.push({ date, close });
      }
      if (points.length > 0) return ok(points);
    } catch {
      // try next proxy
    }
  }

  return err(new Error(`Could not fetch monthly closes for ${ticker} (all proxies failed)`));
}
