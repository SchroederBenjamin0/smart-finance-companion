import { configRepo } from '@/db/repositories/config';
import { newsRepo } from '@/db/repositories/news';
import { positionsRepo } from '@/db/repositories/positions';
import { recommendationsRepo } from '@/db/repositories/recommendations';
import { transactionsRepo } from '@/db/repositories/transactions';
import { ALL_CONFIG_KEYS } from '@/db/types';
import type { NewsEvent, Recommendation } from '@/db/types';
import { generateId } from '@/lib/id';
import { hoursSince, nowIso } from '@/lib/date';
import { fetchNewsForSymbols } from '@/services/marketaux';
import { filterNews } from '@/services/news-filter';
import { generateQuarterlyInsight } from '@/services/quarterlyInsight';
import { migrateTickers } from './migrateTickers';

export interface WatchdogReport {
  newsAdded: number;
  newsErrors: number;
  quarterlyGenerated: boolean;
}

const DAILY_KEY = ALL_CONFIG_KEYS.lastWatchdogRun;

export async function runStartupTasks(): Promise<WatchdogReport> {
  const report: WatchdogReport = {
    newsAdded: 0,
    newsErrors: 0,
    quarterlyGenerated: false,
  };

  // Idempotent migrations run every cold start (cheap, no network).
  await migrateTickers().catch(() => undefined);

  const lastRun = await configRepo.getRaw(DAILY_KEY);
  const lastRunIso = lastRun.ok ? lastRun.value : null;
  if (lastRunIso && hoursSince(lastRunIso) < 24) return report;

  // Daily news scan: fetch + Claude-filter for high-relevance items.
  const positionsR = await positionsRepo.findAll();
  if (positionsR.ok && positionsR.value.length > 0) {
    const tickers = positionsR.value
      .map((p) => p.ticker.replace(/\.[A-Z]+$/, ''))
      .filter(Boolean);
    if (tickers.length > 0) {
      const articlesR = await fetchNewsForSymbols(tickers, 5);
      if (articlesR.ok) {
        const events: NewsEvent[] = [];
        for (const article of articlesR.value) {
          const matchedTicker =
            article.entities[0]?.symbol ?? tickers[0] ?? 'UNKNOWN';
          const filterR = await filterNews({
            ticker: matchedTicker,
            headline: article.title,
            url: article.url,
            publishedAt: article.published_at,
            description: article.description,
            source: article.source,
          });
          if (!filterR.ok) {
            report.newsErrors += 1;
            continue;
          }
          if (filterR.value === null) continue;
          const filtered = filterR.value;
          events.push({
            id: generateId(),
            ticker: filtered.ticker,
            headline: filtered.headline,
            url: filtered.url,
            publishedAt: filtered.publishedAt,
            relevance: filtered.relevance,
            category: filtered.category,
            summary: filtered.summary,
            pushedToUser: 0,
            userDismissed: 0,
            createdAt: nowIso(),
          });
        }
        if (events.length > 0) {
          await newsRepo.upsertMany(events);
          report.newsAdded = events.length;
        }
      }
    }
  }

  // Quarterly insight: only on the first calendar day of a new quarter,
  // and only if we don't already have one for this quarter.
  const now = new Date();
  if (isQuarterStart(now)) {
    const quarterId = quarterIdOf(now);
    const existing = await recommendationsRepo.findByTrigger('quarterly', 5);
    const alreadyHave =
      existing.ok &&
      existing.value.some((r) => quarterIdOf(new Date(r.date)) === quarterId);
    if (!alreadyHave) {
      const portfolio = positionsR.ok ? positionsR.value : [];
      const newsR = await newsRepo.findRecentHigh(30);
      const news = newsR.ok ? newsR.value : [];
      const txR = await transactionsRepo.findRecent(500);
      const expenses = txR.ok
        ? txR.value.filter(
            (t) =>
              t.amount < 0 &&
              new Date(t.date).getTime() >
                now.getTime() - 90 * 24 * 60 * 60 * 1000,
          )
        : [];
      const insightR = await generateQuarterlyInsight({
        portfolio,
        news,
        expenses,
      });
      if (insightR.ok) {
        const rec: Recommendation = {
          id: generateId(),
          date: nowIso(),
          trigger: 'quarterly',
          availableAmount: 0,
          suggestionJson: JSON.stringify({ markdown: insightR.value.markdown }),
          rationale: insightR.value.markdown.slice(0, 200),
          status: 'pending',
          userActionAt: null,
        };
        await recommendationsRepo.upsert(rec);
        report.quarterlyGenerated = true;
      }
    }
  }

  await configRepo.setRaw(DAILY_KEY, nowIso());
  return report;
}

function isQuarterStart(d: Date): boolean {
  return d.getDate() === 1 && [0, 3, 6, 9].includes(d.getMonth());
}

function quarterIdOf(d: Date): string {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}
