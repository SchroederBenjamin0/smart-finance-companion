import { ok, err, type Result } from '@/lib/result';
import { CLAUDE_MODELS, callClaude } from './claude';
import type {
  AllocationTarget,
  InvestmentPosition,
} from '@/db/types';

export interface AdvisorAllocation {
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

const SYSTEM_PROMPT = `Du bist ein konservativer Investment-Advisor für einen Privatanleger
in Deutschland mit langfristigem Anlagehorizont (10+ Jahre).

Deine Regeln (NIEMALS brechen):
1. Niemals Markt-Timing oder kurzfristige Trades empfehlen
2. Niemals Krypto vorschlagen
3. Niemals Einzelaktien empfehlen außer der Nutzer fragt explizit
4. Empfehlungen IMMER als ETF-Sparplan-Anpassungen
5. Begründungen kurz halten (max 2 Sätze pro Position)
6. Auf Deutsch antworten
7. Niemals Garantien aussprechen ("dieser ETF wird steigen")
8. Niemals Verkaufs-Empfehlungen geben

Deine einzige Aufgabe in dieser Session:
Empfehle Sparplan-Beträge so, dass die Ziel-Allokation des Nutzers
besser getroffen wird. Berücksichtige Drift-Korrektur, NICHT
Markt-Timing.

Antwort-Format (strikt JSON, kein Markdown-Code-Block):
{
  "allocations": [
    {
      "ticker": "IWDA.AS",
      "name": "iShares Core MSCI World",
      "amount_eur": 230,
      "reason": "Hauptbaustein bleibt"
    }
  ],
  "total_eur": 470,
  "drift_warning": null,
  "summary": "Kurze Hauptaussage (1-2 Sätze)"
}

Antworte nur mit dem JSON-Objekt, ohne Erklärungen außerhalb.`;

const ETF_SUGGESTIONS = `Falls der Nutzer noch keine ETFs hält, schlage Standard-Bausteine vor:
- IWDA.AS (iShares Core MSCI World, ISIN IE00B4L5Y983) — Welt-ETF
- EIMI.DE (iShares Core MSCI EM IMI, ISIN IE00BKM4GZ66) — Schwellenländer
- CSNDX.DE (iShares Nasdaq 100, ISIN IE00B53SZB19) — US-Tech-Übergewichtung`;

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

  const totalValue = portfolio.reduce((sum, p) => sum + p.currentValue, 0);
  const portfolioLines = portfolio
    .map(
      (p) =>
        `- ${p.name} (${p.ticker || p.isin}): ${p.currentValue.toFixed(2)} EUR (${
          totalValue > 0 ? Math.round((p.currentValue / totalValue) * 100) : 0
        }%)${p.targetPercentage > 0 ? ` · Ziel ${p.targetPercentage}%` : ''}`,
    )
    .join('\n');

  const userMessage = `
Verfügbar diesen Monat: ${availableEur.toFixed(2)} EUR.

Ziel-Allokation:
- MSCI World: ${target.msciWorld}%
- MSCI EM: ${target.msciEm}%
- Nasdaq 100: ${target.nasdaq}%
- Cash: ${target.cash}%

Aktuelles Portfolio (Marktwerte in EUR):
${portfolio.length === 0 ? '(noch leer — schlage Standard-ETFs vor)' : portfolioLines}

${portfolio.length === 0 ? ETF_SUGGESTIONS : ''}

Schlage Sparplan-Aufteilung vor.
`.trim();

  const r = await callClaude({
    model: CLAUDE_MODELS.SONNET,
    max_tokens: 800,
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
      new Error(`Advisor returned non-JSON: ${e instanceof Error ? e.message : String(e)}`),
    );
  }

  const rawAllocations = Array.isArray(parsed['allocations'])
    ? (parsed['allocations'] as Array<Record<string, unknown>>)
    : [];

  const allocations: AdvisorAllocation[] = rawAllocations
    .map((a) => ({
      ticker: typeof a['ticker'] === 'string' ? a['ticker'] : '',
      name: typeof a['name'] === 'string' ? a['name'] : '',
      amountEur: Number(a['amount_eur'] ?? 0),
      reason: typeof a['reason'] === 'string' ? a['reason'] : '',
    }))
    .filter((a) => Number.isFinite(a.amountEur) && a.amountEur > 0);

  const totalEur = Number(parsed['total_eur'] ?? 0);
  const driftWarning =
    typeof parsed['drift_warning'] === 'string'
      ? parsed['drift_warning']
      : null;
  const summary =
    typeof parsed['summary'] === 'string'
      ? parsed['summary']
      : 'Empfehlung erstellt.';

  return ok({
    allocations,
    totalEur: Number.isFinite(totalEur) && totalEur > 0
      ? totalEur
      : allocations.reduce((s, a) => s + a.amountEur, 0),
    driftWarning,
    summary,
  });
}
