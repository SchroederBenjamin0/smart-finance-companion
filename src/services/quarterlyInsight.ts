import { ok, err, type Result } from '@/lib/result';
import { CLAUDE_MODELS, callClaude } from './claude';
import type { InvestmentPosition, NewsEvent, Transaction } from '@/db/types';

export interface QuarterlyInsight {
  markdown: string;
}

const SYSTEM_PROMPT = `Du bist ein erfahrener Finanz-Coach, der einen quartalsweisen
Brief an einen Privatanleger schreibt.

Schreibe wie ein kluger Freund — nicht wie ein Bank-Berater.
Klare deutsche Sprache, konkrete Beobachtungen, kein Buzzword-Bingo.

Struktur des Briefes:
1. Quartal-Übersicht (1 Absatz)
2. Was funktioniert hat (1 Absatz, Top-3 Performer)
3. Was nicht funktioniert hat (1 Absatz, Bottom-3, OHNE Verkaufsempfehlung)
4. Drift-Status (1 Absatz)
5. Beobachtungen + Anpassungen für nächstes Quartal (1 Absatz)
6. Steuer-Hinweis (1 Absatz, falls relevant)

Regeln:
- Niemals Markt-Timing
- Niemals "verkaufen" empfehlen
- Niemals Garantien
- Auf Deutsch
- Tonalität: nüchtern, freundlich, ehrlich

Antwort-Format: Markdown-Brief, kein JSON.`;

export async function generateQuarterlyInsight(input: {
  portfolio: InvestmentPosition[];
  news: NewsEvent[];
  expenses: Transaction[];
}): Promise<Result<QuarterlyInsight>> {
  const portfolioBlock = input.portfolio
    .map(
      (p) =>
        `- ${p.name} (${p.ticker || p.isin}): ${p.currentValue.toFixed(2)} EUR (Eingezahlt ${p.totalInvested.toFixed(2)} EUR)`,
    )
    .join('\n');

  const newsBlock = input.news
    .slice(0, 30)
    .map(
      (n) =>
        `- ${n.publishedAt.slice(0, 10)} ${n.ticker} [${n.relevance}] ${n.headline}`,
    )
    .join('\n');

  const expByCat = input.expenses.reduce<Record<string, number>>((acc, t) => {
    acc[t.category] = (acc[t.category] ?? 0) + Math.abs(t.amount);
    return acc;
  }, {});
  const totalExp = Object.values(expByCat).reduce((s, n) => s + n, 0);
  const expBlock = Object.entries(expByCat)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => `- ${cat}: ${amt.toFixed(2)} EUR`)
    .join('\n');

  const userMessage = `
Portfolio (Marktwerte in EUR):
${portfolioBlock || '(leer)'}

News der letzten 90 Tage (max. 30):
${newsBlock || '(keine)'}

Ausgaben des Quartals (Summe ${totalExp.toFixed(2)} EUR):
${expBlock || '(keine)'}

Schreibe den Quartalsbrief.
`.trim();

  const r = await callClaude({
    model: CLAUDE_MODELS.OPUS,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });
  if (!r.ok) return err(r.error);

  const text = r.value.content?.[0]?.text ?? '';
  return ok({ markdown: text.trim() });
}
