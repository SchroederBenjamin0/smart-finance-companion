import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
  Loader2,
  Newspaper,
} from 'lucide-react';
import { findByIsin } from '@/data/tr-universe';
import { formatEur } from '@/lib/currency';
import { getNewsForTicker, type NewsCacheItem } from '@/services/news';
import { trDeepLink } from '@/services/yahoo';

export interface RecommendationCardData {
  isin: string;
  ticker: string;
  name: string;
  amountEur: number;
  /** LLM rationale specific to THIS split (why this value, in this share, now). */
  reason: string;
  /** Whether this is a buy or a trim suggestion. Defaults to 'buy'. */
  action?: 'buy' | 'trim';
}

interface Props {
  data: RecommendationCardData;
  /** When true, opens with the info panel expanded. Default false (collapsed). */
  initiallyExpanded?: boolean;
}

export function RecommendationCard({
  data,
  initiallyExpanded = false,
}: Props) {
  const isTrim = data.action === 'trim';
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [news, setNews] = useState<NewsCacheItem[] | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  const instrument = findByIsin(data.isin);
  // Prefer the canonical ticker from the whitelist for news lookups;
  // fall back to whatever the recommendation carried.
  // For trims, the position may not be in TR_UNIVERSE (legacy / TR-PDF import).
  const lookupTicker = instrument?.tickerYahoo ?? data.ticker;

  useEffect(() => {
    if (!expanded) return;
    if (isTrim) return; // trims: skip news fetch — position may not be in universe
    if (news !== null) return;
    if (!lookupTicker) return;
    setNewsLoading(true);
    setNewsError(null);
    void (async () => {
      const r = await getNewsForTicker(lookupTicker);
      if (r.ok) setNews(r.value);
      else {
        setNews([]);
        setNewsError(r.error.message);
      }
      setNewsLoading(false);
    })();
  }, [expanded, isTrim, lookupTicker, news]);

  // For trims: instrument may be null (position not in TR universe) — guard everywhere.
  const profileText = !isTrim ? (instrument?.description ?? null) : null;
  const sector = instrument?.sector ?? null;

  return (
    <div className="rounded-control bg-surface shadow-card">
      <button
        type="button"
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-meta font-bold ${
            isTrim
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
              : 'bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200'
          }`}
        >
          {data.ticker.slice(0, 4) || 'ETF'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-body font-semibold text-ink">
              {data.name}
            </div>
            {isTrim && (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-caption font-semibold text-amber-800">
                Reduzieren
              </span>
            )}
          </div>
          <div className="mt-0.5 text-caption text-ink-subtle">
            {sector ? `${sector} · ` : ''}
            {data.ticker}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div
            className={`text-right text-body font-semibold tabular-nums ${
              isTrim
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {formatEur(data.amountEur)}
          </div>
          <span
            className="grid h-7 w-7 place-items-center rounded-full bg-paper text-ink-muted"
            aria-hidden="true"
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} />
            )}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-forest-950/5 px-4 py-3">
          {profileText && (
            <div className="flex items-start gap-2.5">
              <Info
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-subtle"
                strokeWidth={2.5}
              />
              <p className="text-meta leading-snug text-ink-muted">
                {profileText}
              </p>
            </div>
          )}

          {data.reason && (
            <div
              className={`rounded-chip px-3 py-2 ${
                isTrim ? 'bg-amber-50' : 'bg-mint-100'
              }`}
            >
              <div
                className={`text-caption font-bold uppercase tracking-wider ${
                  isTrim ? 'text-amber-800' : 'text-forest-800'
                }`}
              >
                {isTrim ? 'Begründung' : 'Warum genau hier'}
              </div>
              <p className="mt-0.5 text-meta leading-snug text-ink">
                {data.reason}
              </p>
            </div>
          )}

          {!isTrim && (
            <div>
              <div className="flex items-center gap-2 text-caption font-semibold uppercase tracking-wider text-ink-subtle">
                <Newspaper className="h-3.5 w-3.5" strokeWidth={2.5} />
                Aktuelle News
              </div>
              <div className="mt-2 space-y-1.5">
                {newsLoading && (
                  <div className="flex items-center gap-2 text-meta text-ink-subtle">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
                    Lade…
                  </div>
                )}
                {!newsLoading && news && news.length > 0 && (
                  <ul className="space-y-1.5">
                    {news.map((item) => (
                      <li key={item.uuid}>
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener"
                          className="block rounded-chip bg-paper px-3 py-2 active:bg-mint-100"
                        >
                          <div className="text-meta font-medium leading-snug text-ink">
                            {item.title}
                          </div>
                          <div className="mt-0.5 text-caption text-ink-subtle">
                            {item.publisher || 'Quelle unbekannt'} ·{' '}
                            {formatPublished(item.publishedAt)}
                          </div>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {!newsLoading && news && news.length === 0 && (
                  <p className="text-meta text-ink-subtle">
                    {newsError
                      ? `Keine News abrufbar (${newsError}).`
                      : 'Aktuell keine Headlines für diesen Wert.'}
                  </p>
                )}
              </div>
            </div>
          )}

          {data.isin && (
            <a
              href={trDeepLink(data.isin)}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 rounded-full bg-forest-950 px-3 py-1 text-caption font-semibold text-white"
            >
              In Trade Republic öffnen
              <ExternalLink className="h-3 w-3" strokeWidth={2.5} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function formatPublished(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.`;
}
