import { ok, err, type Result } from '@/lib/result';
import { CLAUDE_MODELS, callClaude } from './claude';
import type { NewsCategory, NewsRelevance } from '@/db/types';

export interface FilteredNews {
  ticker: string;
  headline: string;
  url: string;
  publishedAt: string;
  relevance: NewsRelevance;
  category: NewsCategory;
  summary: string;
}

const SYSTEM_PROMPT = `Du bist ein News-Relevanz-Filter für einen langfristigen Anleger.

Aufgabe: Pro Headline entscheide, ob diese Information materiell ist
für den Investment-Case eines Buy-and-Hold-Anlegers (10+ Jahre Horizont).

Materiell:
- Quartals-/Jahreszahlen
- CEO-Wechsel, grundlegende Strategie-Wechsel
- Übernahmen, Fusionen, Spinoffs
- Regulatorische Großereignisse (Klagen, Verbote)
- Insider-Trading-Meldungen
- Bilanz-Skandale, Buchhaltungs-Probleme

NICHT materiell:
- Tagesschwankungen
- Analyst-Upgrades/Downgrades
- Produktankündigungen ohne Umsatz-Impact
- Konkurrenz-News
- Allgemeine Marktbewegungen

Antwort-Format (strikt JSON, kein Markdown):
{
  "relevant": true,
  "category": "earnings",
  "relevance": "high",
  "summary": "Kurze Zusammenfassung in 1 Satz auf Deutsch"
}

category ∈ ["earnings","leadership","ma","regulatory","other"]
relevance ∈ ["high","medium","low"]

Keine Verkaufs- oder Kauf-Empfehlung. Nur Relevanz und Kategorie.`;

export interface NewsFilterInput {
  ticker: string;
  headline: string;
  url: string;
  publishedAt: string;
  description?: string;
  source?: string;
}

export async function filterNews(
  input: NewsFilterInput,
): Promise<Result<FilteredNews | null>> {
  const userMessage = `
Ticker: ${input.ticker}
Headline: ${input.headline}
Beschreibung: ${input.description ?? '(keine)'}
Quelle: ${input.source ?? '(unbekannt)'}
Datum: ${input.publishedAt}
`.trim();

  const r = await callClaude({
    model: CLAUDE_MODELS.HAIKU,
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });
  if (!r.ok) return err(r.error);

  const text = r.value.content?.[0]?.text ?? '';
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch (e) {
    return err(
      new Error(`News filter returned non-JSON: ${e instanceof Error ? e.message : String(e)}`),
    );
  }

  if (parsed['relevant'] !== true) return ok(null);
  const category = (parsed['category'] as NewsCategory) ?? 'other';
  const relevance = (parsed['relevance'] as NewsRelevance) ?? 'low';
  const summary =
    typeof parsed['summary'] === 'string' ? parsed['summary'] : input.headline;
  if (!['high', 'medium', 'low'].includes(relevance)) return ok(null);
  if (!['earnings', 'leadership', 'ma', 'regulatory', 'other'].includes(category)) {
    return ok(null);
  }
  return ok({
    ticker: input.ticker,
    headline: input.headline,
    url: input.url,
    publishedAt: input.publishedAt,
    relevance,
    category,
    summary,
  });
}
