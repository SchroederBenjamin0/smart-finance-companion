import { ok, err, type Result } from '@/lib/result';
import { CLAUDE_MODELS, callClaude } from './claude';
import type {
  AllocationTarget,
  InvestmentPosition,
} from '@/db/types';
import { TR_UNIVERSE, findByIsin } from '@/data/tr-universe';
import {
  analyzePortfolio,
  SECTOR_CAP_PCT,
  SINGLE_STOCK_CAP_PCT,
  sectorOf,
  type PortfolioAnalysis,
  type ConcentrationFlag,
} from '@/modules/portfolio-analysis';

export type AdvisorAction = 'buy' | 'trim';

export interface AdvisorAllocation {
  action: AdvisorAction;
  isin: string;
  ticker: string;
  name: string;
  amountEur: number;
  reason: string;
}

export interface AdvisorRecommendation {
  allocations: AdvisorAllocation[];
  totalEur: number;
  diversification: string | null;
  driftWarning: string | null;
  summary: string;
}

const BASE_SYSTEM_PROMPT = `Du bist ein konservativer Investment-Advisor für einen Privatanleger
in Deutschland mit langfristigem Anlagehorizont (10+ Jahre).

Deine Regeln (NIEMALS brechen):
1. Niemals Markt-Timing oder kurzfristige Trades empfehlen
2. Niemals Krypto vorschlagen
3. Einzelaktien nur sparsam, max 30% der Empfehlungs-Summe, Bevorzugung von ETFs
4. Verkaufs-Vorschläge ("trim") NUR für Positionen/Sektoren, die in der gelieferten Analyse als Übergewicht markiert sind, und ausschließlich Richtung Ziel-Allokation. Der Trim-Betrag darf den gelieferten Spielraum NICHT überschreiten. Niemals etwas verkaufen, weil ein Wert "schlecht" oder ein anderer "besser" erscheint.
5. Neue Käufe bevorzugt in unter dem Ziel liegende Bausteine lenken (Diversifikation)
6. Begründungen kurz halten (max 2 Sätze pro Position)
7. Auf Deutsch antworten
8. Niemals Garantien aussprechen ("dieser ETF wird steigen")

WICHTIG — Werteuniversum:
Du darfst AUSSCHLIESSLICH Werte aus der unten gelieferten Liste (TR-Universum)
auswählen. Jede Empfehlung MUSS eine ISIN aus dieser Liste enthalten. Wenn
keine geeignete Auswahl möglich ist, gib eine leere allocations-Liste zurück
und erkläre warum in summary.

Antwort-Format (strikt JSON, kein Markdown-Code-Block):
{
  "allocations": [
    { "action": "buy",  "isin": "IE00B4L5Y983", "amount_eur": 230, "reason": "..." },
    { "action": "trim", "isin": "<gehaltene ISIN>", "amount_eur": 120, "reason": "..." }
  ],
  "total_eur": 470,
  "diversification": "1-2 Sätze zur Sektor-/Konzentrations-Lage",
  "drift_warning": null,
  "summary": "Kurze Hauptaussage (1-2 Sätze)"
}

Antworte nur mit dem JSON-Objekt, ohne Erklärungen außerhalb.`;

function universeMessage(): string {
  const lines = TR_UNIVERSE.map(
    (u) => `- ${u.isin} | ${u.tickerYahoo} | ${u.type} | ${u.displayName}`,
  ).join('\n');
  return `TR-Universum (zulässige Werte):\n${lines}`;
}

export async function recommendAllocation(input: {
  availableEur: number;
  portfolio: InvestmentPosition[];
  target: AllocationTarget;
  analysis?: PortfolioAnalysis;
}): Promise<Result<AdvisorRecommendation>> {
  const { availableEur, portfolio, target } = input;
  if (availableEur <= 0) {
    return ok({
      allocations: [],
      totalEur: 0,
      diversification: null,
      driftWarning: null,
      summary: 'Diesen Monat keine zusätzliche Einzahlung im Investment-Konto.',
    });
  }

  const analysis =
    input.analysis ??
    analyzePortfolio(portfolio, {
      sectorCapPct: SECTOR_CAP_PCT,
      singleStockCapPct: SINGLE_STOCK_CAP_PCT,
      driftTolerancePp: 5,
    });

  const userMessage = buildUserMessage({ availableEur, portfolio, target, analysis });

  // First attempt — strict prompt, may still drift into off-list ISINs.
  const first = await runAdvisor(userMessage, false, portfolio, analysis);
  if (!first.ok) return first;

  if (first.value.allocations.length > 0) {
    return ok(first.value);
  }

  // The post-filter dropped everything → retry once with an explicit hint.
  const retried = await runAdvisor(userMessage, true, portfolio, analysis);
  if (!retried.ok) return retried;
  return ok(retried.value);
}

async function runAdvisor(
  userMessage: string,
  isRetry: boolean,
  portfolio: InvestmentPosition[],
  analysis: PortfolioAnalysis,
): Promise<Result<AdvisorRecommendation>> {
  const system = isRetry
    ? `${BASE_SYSTEM_PROMPT}\n\nHINWEIS: Beim ersten Versuch wurden Werte ausserhalb der Liste vorgeschlagen — bitte AUSSCHLIESSLICH die gelieferten ISINs benutzen.`
    : BASE_SYSTEM_PROMPT;

  const r = await callClaude({
    model: CLAUDE_MODELS.SONNET,
    max_tokens: 900,
    system,
    messages: [
      {
        role: 'user',
        content: `${universeMessage()}\n\n${userMessage}`,
      },
    ],
  });
  if (!r.ok) return err(r.error);

  const text = r.value.content?.[0]?.text ?? '';
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch (e) {
    return err(
      new Error(
        `Advisor returned non-JSON: ${e instanceof Error ? e.message : String(e)}`,
      ),
    );
  }

  return ok(normalizeAndFilter(parsed, { portfolio, analysis }));
}

function buildUserMessage(input: {
  availableEur: number;
  portfolio: InvestmentPosition[];
  target: AllocationTarget;
  analysis: PortfolioAnalysis;
}): string {
  const { availableEur, portfolio, target, analysis } = input;
  const totalValue = portfolio.reduce((sum, p) => sum + p.currentValue, 0);
  const portfolioLines = portfolio
    .map(
      (p) =>
        `- ${p.name} (${p.ticker || p.isin}): ${p.currentValue.toFixed(2)} EUR (${
          totalValue > 0 ? Math.round((p.currentValue / totalValue) * 100) : 0
        }%)${p.targetPercentage > 0 ? ` · Ziel ${p.targetPercentage}%` : ''}`,
    )
    .join('\n');

  const sectorLines = analysis.sectors
    .map((s) => `- ${s.sector}: ${s.pct.toFixed(0)}% (${s.valueEur.toFixed(0)} EUR)`)
    .join('\n');
  const flagLines = analysis.flags.length
    ? analysis.flags
        .map(
          (f) =>
            `- Übergewicht ${f.label}: ${f.pct.toFixed(0)}% (Ziel/Cap ${f.capPct}%, Trim-Spielraum bis ${f.overByEur.toFixed(0)} EUR)`,
        )
        .join('\n')
    : '(keine Übergewichte)';

  return `
Verfügbar diesen Monat: ${availableEur.toFixed(2)} EUR.

Ziel-Allokation:
- MSCI World: ${target.msciWorld}%
- MSCI EM: ${target.msciEm}%
- Nasdaq 100: ${target.nasdaq}%
- Cash: ${target.cash}%

Aktuelles Portfolio (Marktwerte in EUR):
${portfolio.length === 0 ? '(noch leer — schlage geeignete Welt+EM-Bausteine aus dem TR-Universum vor)' : portfolioLines}

Sektor-Verteilung:
${analysis.sectors.length ? sectorLines : '(leer)'}
Einzelaktien-Anteil: ${analysis.singleStockPct.toFixed(0)}%

Übergewichte (nur diese dürfen getrimmt werden):
${flagLines}

Schlage Sparplan-Aufteilung vor — ausschließlich Werte aus dem TR-Universum.
`.trim();
}

/**
 * Normalize the LLM response and drop any allocation that isn't valid.
 * For buys: ISIN must be in TR_UNIVERSE.
 * For trims: position must be held and have an overweight flag with positive headroom.
 * Trim amounts are hard-clamped to the flagged overByEur headroom.
 *
 * Exported for tests.
 */
export function normalizeAndFilter(
  parsed: Record<string, unknown>,
  ctx?: { portfolio?: InvestmentPosition[]; analysis?: PortfolioAnalysis },
): AdvisorRecommendation {
  const portfolio = ctx?.portfolio ?? [];
  const flags = ctx?.analysis?.flags ?? [];

  const rawAllocations = Array.isArray(parsed['allocations'])
    ? (parsed['allocations'] as Array<Record<string, unknown>>)
    : [];

  const allocations: AdvisorAllocation[] = [];
  for (const a of rawAllocations) {
    const action: AdvisorAction = a['action'] === 'trim' ? 'trim' : 'buy';
    const isin = typeof a['isin'] === 'string' ? a['isin'] : '';
    const amount = Number(a['amount_eur'] ?? 0);
    const reason = typeof a['reason'] === 'string' ? a['reason'] : '';
    if (!Number.isFinite(amount) || amount <= 0) continue;

    if (action === 'buy') {
      const match = findByIsin(isin);
      if (!match) continue;
      allocations.push({
        action: 'buy',
        isin,
        ticker: match.tickerYahoo,
        name: match.displayName,
        amountEur: amount,
        reason,
      });
    } else {
      const held = portfolio.find((p) => p.isin.toUpperCase() === isin.toUpperCase());
      if (!held) continue;
      const headroom = trimHeadroom(held, flags);
      if (headroom <= 0) continue;
      allocations.push({
        action: 'trim',
        isin: held.isin,
        ticker: held.ticker,
        name: held.name,
        amountEur: Math.min(amount, headroom),
        reason,
      });
    }
  }

  const totalEur = allocations
    .filter((a) => a.action === 'buy')
    .reduce((s, a) => s + a.amountEur, 0);
  const diversification =
    typeof parsed['diversification'] === 'string' ? parsed['diversification'] : null;
  const driftWarning =
    typeof parsed['drift_warning'] === 'string' ? parsed['drift_warning'] : null;
  const summary =
    typeof parsed['summary'] === 'string' ? parsed['summary'] : 'Empfehlung erstellt.';
  return { allocations, totalEur, diversification, driftWarning, summary };
}

function trimHeadroom(position: InvestmentPosition, flags: ConcentrationFlag[]): number {
  const sector = sectorOf(position);
  let headroom = 0;
  for (const f of flags) {
    const justifies =
      (f.kind === 'position' && f.ref.toUpperCase() === position.isin.toUpperCase()) ||
      (f.kind === 'sector' && f.ref === sector) ||
      (f.kind === 'single-stock' && isTrimmableStock(position));
    if (justifies) headroom = Math.max(headroom, f.overByEur);
  }
  return headroom;
}

function isTrimmableStock(position: InvestmentPosition): boolean {
  const u = findByIsin(position.isin);
  return u ? u.type === 'stock' : position.assetType === 'stock';
}
