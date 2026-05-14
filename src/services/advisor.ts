import { ok, err, type Result } from '@/lib/result';
import { CLAUDE_MODELS, callClaude } from './claude';
import type {
  AllocationTarget,
  InvestmentPosition,
} from '@/db/types';
import { TR_UNIVERSE, findByIsin } from '@/data/tr-universe';

export interface AdvisorAllocation {
  isin: string;
  ticker: string;
  name: string;
  amountEur: number;
  reason: string;
}

export interface AdvisorRecommendation {
  allocations: AdvisorAllocation[];
  totalEur: number;
  driftWarning: string | null;
  summary: string;
}

const BASE_SYSTEM_PROMPT = `Du bist ein konservativer Investment-Advisor für einen Privatanleger
in Deutschland mit langfristigem Anlagehorizont (10+ Jahre).

Deine Regeln (NIEMALS brechen):
1. Niemals Markt-Timing oder kurzfristige Trades empfehlen
2. Niemals Krypto vorschlagen
3. Einzelaktien nur sparsam, max 30% der Empfehlungs-Summe, Bevorzugung von ETFs
4. Empfehlungen IMMER als Sparplan-Anpassungen (Käufe, keine Verkäufe)
5. Begründungen kurz halten (max 2 Sätze pro Position)
6. Auf Deutsch antworten
7. Niemals Garantien aussprechen ("dieser ETF wird steigen")
8. Niemals Verkaufs-Empfehlungen geben

WICHTIG — Werteuniversum:
Du darfst AUSSCHLIESSLICH Werte aus der unten gelieferten Liste (TR-Universum)
auswählen. Jede Empfehlung MUSS eine ISIN aus dieser Liste enthalten. Wenn
keine geeignete Auswahl möglich ist, gib eine leere allocations-Liste zurück
und erkläre warum in summary.

Antwort-Format (strikt JSON, kein Markdown-Code-Block):
{
  "allocations": [
    {
      "isin": "IE00B4L5Y983",
      "ticker": "IWDA.AS",
      "amount_eur": 230,
      "reason": "Hauptbaustein bleibt das MSCI World."
    }
  ],
  "total_eur": 470,
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
}): Promise<Result<AdvisorRecommendation>> {
  const { availableEur, portfolio, target } = input;
  if (availableEur <= 0) {
    return ok({
      allocations: [],
      totalEur: 0,
      driftWarning: null,
      summary: 'Diesen Monat keine zusätzliche Einzahlung im Investment-Konto.',
    });
  }

  const userMessage = buildUserMessage({ availableEur, portfolio, target });

  // First attempt — strict prompt, may still drift into off-list ISINs.
  const first = await runAdvisor(userMessage, false);
  if (!first.ok) return first;

  if (first.value.allocations.length > 0) {
    return ok(first.value);
  }

  // The post-filter dropped everything → retry once with an explicit hint.
  const retried = await runAdvisor(userMessage, true);
  if (!retried.ok) return retried;
  return ok(retried.value);
}

async function runAdvisor(
  userMessage: string,
  isRetry: boolean,
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

  return ok(normalizeAndFilter(parsed));
}

function buildUserMessage(input: {
  availableEur: number;
  portfolio: InvestmentPosition[];
  target: AllocationTarget;
}): string {
  const { availableEur, portfolio, target } = input;
  const totalValue = portfolio.reduce((sum, p) => sum + p.currentValue, 0);
  const portfolioLines = portfolio
    .map(
      (p) =>
        `- ${p.name} (${p.ticker || p.isin}): ${p.currentValue.toFixed(2)} EUR (${
          totalValue > 0 ? Math.round((p.currentValue / totalValue) * 100) : 0
        }%)${p.targetPercentage > 0 ? ` · Ziel ${p.targetPercentage}%` : ''}`,
    )
    .join('\n');

  return `
Verfügbar diesen Monat: ${availableEur.toFixed(2)} EUR.

Ziel-Allokation:
- MSCI World: ${target.msciWorld}%
- MSCI EM: ${target.msciEm}%
- Nasdaq 100: ${target.nasdaq}%
- Cash: ${target.cash}%

Aktuelles Portfolio (Marktwerte in EUR):
${portfolio.length === 0 ? '(noch leer — schlage geeignete Welt+EM-Bausteine aus dem TR-Universum vor)' : portfolioLines}

Schlage Sparplan-Aufteilung vor — ausschließlich Werte aus dem TR-Universum.
`.trim();
}

/**
 * Normalize the LLM response and drop any allocation that isn't in
 * TR_UNIVERSE. Display name + ticker are overwritten from the whitelist
 * so the UI always shows the exact Trade-Republic-Name the user sees.
 *
 * Exported for tests.
 */
export function normalizeAndFilter(
  parsed: Record<string, unknown>,
): AdvisorRecommendation {
  const rawAllocations = Array.isArray(parsed['allocations'])
    ? (parsed['allocations'] as Array<Record<string, unknown>>)
    : [];

  const allocations: AdvisorAllocation[] = rawAllocations
    .map((a) => ({
      isin: typeof a['isin'] === 'string' ? a['isin'] : '',
      ticker: typeof a['ticker'] === 'string' ? a['ticker'] : '',
      name: typeof a['name'] === 'string' ? a['name'] : '',
      amountEur: Number(a['amount_eur'] ?? 0),
      reason: typeof a['reason'] === 'string' ? a['reason'] : '',
    }))
    .map((a) => {
      const match = findByIsin(a.isin);
      if (!match) return null;
      return {
        ...a,
        ticker: match.tickerYahoo,
        name: match.displayName,
      };
    })
    .filter(
      (a): a is AdvisorAllocation =>
        a !== null && Number.isFinite(a.amountEur) && a.amountEur > 0,
    );

  const reportedTotal = Number(parsed['total_eur'] ?? 0);
  const totalEur =
    Number.isFinite(reportedTotal) && reportedTotal > 0
      ? reportedTotal
      : allocations.reduce((s, a) => s + a.amountEur, 0);

  const driftWarning =
    typeof parsed['drift_warning'] === 'string'
      ? parsed['drift_warning']
      : null;
  const summary =
    typeof parsed['summary'] === 'string'
      ? parsed['summary']
      : 'Empfehlung erstellt.';

  return { allocations, totalEur, driftWarning, summary };
}
