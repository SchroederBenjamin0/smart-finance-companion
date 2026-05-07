# LLM-Prompts-Spec

## Übersicht

Vier Use-Cases verwenden Claude oder Haiku. Pro Use-Case: System-Prompt,
User-Message-Schema, Output-Format, Modell-Wahl, Token-Schätzung.

| Use-Case | Modell | Frequenz | Cost/Call |
|----------|--------|----------|-----------|
| Transaktions-Kategorisierung | claude-sonnet-4-6 | alle 2-3 Wochen | ~0,03 € |
| Investment-Empfehlung | claude-sonnet-4-6 | monatlich | ~0,02 € |
| News-Relevanz-Filter | claude-haiku-4-5 | täglich | ~0,002 € |
| Quartals-Insight | claude-opus-4-7 | quartalsweise | ~0,15 € |

**Geschätzte Gesamt-Kosten**: 3-8 €/Monat bei normaler Nutzung.

## Pseudo-Anonymisierung

**Vor jedem Claude-Call** werden persönliche Identifier durch Hashes ersetzt.
In `src/lib/anonymize.ts`:

```typescript
import { createHash } from './hash';

const counterpartyMap = new Map<string, string>();
let counter = 0;

export function anonymizeCounterparty(name: string): string {
  if (!counterpartyMap.has(name)) {
    counter++;
    const hash = createHash(name).slice(0, 8);
    counterpartyMap.set(name, `MERCHANT_${hash}`);
  }
  return counterpartyMap.get(name)!;
}

export function deanonymize(map: Map<string, string>, anon: string): string {
  for (const [orig, mapped] of map) {
    if (mapped === anon) return orig;
  }
  return anon;
}
```

**Was wird anonymisiert**:
- Counterparty-Namen (REWE Berlin Friedrichstraße → MERCHANT_a1b2c3d4)
- IBANs (falls in description)
- Persönliche Namen in Verwendungszwecken

**Was bleibt im Klartext**:
- Beträge (sind eh schon abstrakt)
- Datums (sind nicht persönlich)
- Kategorien (sind generisch)
- ETF-Tickers und ISINs (sind öffentliche Informationen)

## Use-Case 1: Transaktions-Kategorisierung

**Modell**: `claude-sonnet-4-6`
**Frequenz**: bei CSV-Import (alle 2-3 Wochen, ein Batch-Call)
**Erwartete Tokens**: ~3000 Input, ~800 Output bei Batch von 30

### System-Prompt

```
Du bist ein deutschsprachiger Finanz-Categorizer.
Deine Aufgabe: Transaktionsdaten klassifizieren.

Verfügbare Kategorien (genau eine pro Buchung):
- lebensmittel  (Supermärkte, Bäcker, Wochenmarkt)
- restaurants   (Restaurants, Lieferdienste, Coffee Shops)
- musik-tools   (Splice, Plugins, Studio-Equipment, DJ-Software)
- software-abos (alle SaaS-Subscriptions außer Music-Tools)
- transport     (Tank, ÖPNV, Bahn, Flüge)
- freizeit      (Kino, Konzerte, Streaming, Games)
- kleidung      (Mode, Schuhe, Accessoires)
- gesundheit    (Apotheke, Arzt, Sport)
- gebühren      (Bankgebühren, Mahnungen, Steuern)
- einkommen     (positive Buchungen)
- transfer      (interne Umbuchungen)
- sonstiges

Wichtig:
- Counterparty-Namen sind anonymisiert (MERCHANT_xxxxxxxx).
  Du musst trotzdem aufgrund von Mustern (z.B. wiederkehrender
  Betrag, Beschreibung, Datum) klassifizieren.
- Antworte NUR als valides JSON, keine Erklärungen außerhalb.

Antwort-Format (strikt JSON, kein Markdown-Code-Block):
[
  {
    "id": 0,
    "category": "lebensmittel",
    "confidence": 0.95,
    "warning": null
  },
  {
    "id": 1,
    "category": "software-abos",
    "confidence": 0.88,
    "warning": "Wiederkehrende Buchung erkannt"
  }
]

Setze warning bei:
- Doppelten Abbuchungen am selben Tag mit gleichem Betrag
- Ungewöhnlich hohen Beträgen (>100€) für Kategorien wie
  lebensmittel oder restaurants
- Wiederkehrenden Buchungen die wie Subscriptions aussehen
```

### User-Message-Format

```typescript
const userMessage = JSON.stringify(
  transactions.map(t => ({
    id: t.localId,
    date: t.date,
    counterparty: anonymizeCounterparty(t.counterparty),
    amount: t.amount,
    description: t.description ?? null,
  }))
);
```

### Output-Parsing

```typescript
interface CategorizationResult {
  id: number;
  category: string;
  confidence: number;
  warning: string | null;
}

const validCategories = new Set([
  'lebensmittel', 'restaurants', 'musik-tools',
  'software-abos', 'transport', 'freizeit',
  'kleidung', 'gesundheit', 'gebühren',
  'einkommen', 'transfer', 'sonstiges',
]);

function parseResponse(raw: string): Result<CategorizationResult[]> {
  // Strip markdown code blocks if Claude wrapped in them
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      return err(new Error('Expected array'));
    }
    // Validate each entry
    for (const entry of parsed) {
      if (!validCategories.has(entry.category)) {
        return err(new Error(`Invalid category: ${entry.category}`));
      }
      if (typeof entry.confidence !== 'number' ||
          entry.confidence < 0 || entry.confidence > 1) {
        return err(new Error(`Invalid confidence: ${entry.confidence}`));
      }
    }
    return ok(parsed);
  } catch (e) {
    return err(new Error(`Parse failed: ${e}`));
  }
}
```

## Use-Case 2: Investment-Empfehlung (monatlich)

**Modell**: `claude-sonnet-4-6`
**Frequenz**: monatlich am 1. + bei Income > 500 €
**Erwartete Tokens**: ~1500 Input, ~600 Output

### System-Prompt

```
Du bist ein konservativer Investment-Advisor für einen Privatanleger
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

Antwort-Format (strikt JSON, kein Markdown):
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
```

### User-Message-Format

```typescript
const userMessage = `
Verfügbar diesen Monat: ${availableEur} EUR.

Ziel-Allokation:
- MSCI World: ${target.msciWorld}%
- MSCI EM: ${target.msciEm}%
- Nasdaq 100: ${target.nasdaq}%
- Cash: ${target.cash}%

Aktuelles Portfolio (Marktwerte in EUR):
${portfolio.positions.map(p =>
  `- ${p.name} (${p.ticker}): ${p.currentValue} EUR (${
    Math.round(p.currentValue / portfolio.totalValue * 100)
  }%)`
).join('\n')}

Schlage Sparplan-Aufteilung vor.
`.trim();
```

## Use-Case 3: News-Relevanz-Filter

**Modell**: `claude-haiku-4-5`
**Frequenz**: täglich beim App-Open für 5-10 Holdings
**Erwartete Tokens**: ~500 Input, ~200 Output pro Aufruf

### System-Prompt

```
Du bist ein News-Relevanz-Filter für einen langfristigen Anleger.

Aufgabe: Pro Headline entscheide, ob diese Information materiell
ist für den Investment-Case eines Buy-and-Hold-Anlegers
(10+ Jahre Horizont).

Materiell ist:
- Quartals-/Jahreszahlen
- CEO-Wechsel oder grundlegende Strategie-Wechsel
- Übernahmen, Fusionen, Spinoffs
- Regulatorische Großereignisse (Klagen, Verbote)
- Insider-Trading-Meldungen
- Bilanz-Skandale, Buchhaltungs-Probleme

NICHT materiell:
- Tagesschwankungen ("Aktie fällt 3%")
- Analyst-Upgrades/Downgrades
- Produktankündigungen ohne Umsatz-Impact
- Konkurrenz-News
- Allgemeine Marktbewegungen

Antwort-Format (strikt JSON):
{
  "relevant": true,
  "category": "earnings",
  "reason": "Q1-Zahlen mit Umsatz-Impact veröffentlicht"
}

Wichtig: KEINE Verkaufs- oder Kauf-Empfehlung geben.
Nur Relevanz bewerten.
```

### User-Message

```typescript
const userMessage = `
Ticker: ${ticker}
Headline: ${headline}
Beschreibung: ${description ?? '(keine)'}
Quelle: ${source}
Datum: ${publishedAt}
`.trim();
```

## Use-Case 4: Quartals-Insight-Report

**Modell**: `claude-opus-4-7`
**Frequenz**: 4x im Jahr (jeweils 1. Tag des neuen Quartals)
**Erwartete Tokens**: ~5000 Input, ~2000 Output

### System-Prompt

```
Du bist ein erfahrener Finanz-Coach, der einen quartalsweisen
Brief an einen Privatanleger schreibt.

Schreibe wie ein kluger Freund — nicht wie ein Bank-Berater.
Klare deutsche Sprache, konkrete Beobachtungen, kein Finanz-
Buzzword-Bingo.

Struktur des Briefes:
1. Quartal-Übersicht (1 Absatz): Was ist in deinem Portfolio passiert?
2. Was funktioniert hat (1 Absatz): Top-3 Performer
3. Was nicht funktioniert hat (1 Absatz): Bottom-3, OHNE
   Verkaufs-Empfehlung
4. Drift-Status (1 Absatz): Bist du nahe deiner Ziel-Allokation?
5. Beobachtungen (1 Absatz): Was fällt auf? Welche Anpassungen für
   nächsten Quartal sinnvoll?
6. Steuer-Hinweis (1 Absatz, falls relevant): Sparerpauschbetrag,
   Verlustverrechnung

Regeln:
- Niemals Markt-Timing
- Niemals "verkaufen" empfehlen
- Niemals Garantien
- Auf Deutsch
- Tonalität: nüchtern, freundlich, ehrlich

Antwort-Format: Markdown-Brief, keine JSON.
```

### User-Message

Komplettes Portfolio + 90-Tage-News-Sammlung als strukturierter Text.

## Claude API Service Implementation

```typescript
// src/services/claude.ts
import { Result, ok, err } from '../lib/result';
import { getSecret } from '../db/repositories/secrets';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

interface ClaudeRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: 'user'; content: string }[];
}

interface ClaudeResponse {
  content: { type: 'text'; text: string }[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export async function callClaude(
  request: ClaudeRequest
): Promise<Result<ClaudeResponse, ClaudeError>> {
  const keyResult = await getSecret('anthropic_key');
  if (!keyResult.ok) return keyResult;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': keyResult.value,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      return err({
        kind: 'api_error',
        status: response.status,
        message: await response.text(),
      });
    }

    const data: ClaudeResponse = await response.json();
    return ok(data);
  } catch (e) {
    return err({
      kind: 'network_error',
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
```

## Cost-Tracking

Jeder Claude-Call wird in `appLog` mit Token-Count und geschätzten Kosten
geloggt. Settings-View zeigt: "API-Kosten diesen Monat: 3,42 €"

Token-Preise (Stand Mai 2026, prüfe vor Implementation aktuelle Werte):

```typescript
const PRICING = {
  'claude-haiku-4-5':   { input: 1.0, output: 5.0 },   // USD per 1M
  'claude-sonnet-4-6':  { input: 3.0, output: 15.0 },
  'claude-opus-4-7':    { input: 15.0, output: 75.0 },
};
```
