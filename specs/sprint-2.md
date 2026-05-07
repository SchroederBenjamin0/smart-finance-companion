# Sprint 2: Subscriptions & CSV-Import (Wochen 3-4)

## Ziel

Subscription-Tracker funktional, Revolut-CSV-Import mit dreistufiger
Kategorisierung, Insights-View mit erster Ausgaben-Verteilung.

## Definition of Done

✅ User kann Subscriptions hinzufügen, editieren, löschen
✅ Serum-Countdown wird korrekt angezeigt (verbleibende Monate)
✅ CSV-Drag-and-Drop oder File-Picker funktioniert
✅ Categorizer kategorisiert ≥80% automatisch (Stufe 1 + 2)
✅ Bei Confidence < 0.7: Swipe-Through-UI für User-Review
✅ Lookup-Regeln werden gespeichert und in nächstem Import wiederverwendet
✅ Insights-Tab zeigt Pie-Chart pro Kategorie für aktuellen Monat
✅ Anomalien (doppelte Abbuchungen, neue Subs) werden gehighlighted
✅ Vitest-Tests für Categorizer und CSV-Parser grün

## Tasks

### Task 2.1: Subscriptions-Repository und View

`src/db/repositories/subscriptions.ts` mit CRUD.
`src/views/Subscriptions.tsx` mit Liste + "+ Hinzufügen"-Button.
`src/components/feature/subscriptions/SubscriptionForm.tsx` für Create/Edit.

Spezial-Logik:
- Bei `endDate` gesetzt: Countdown-Anzeige "Endet in X Monaten"
- Wenn Heute > endDate: Subscription auto-deaktivieren beim App-Start
- Sortierung: aktive zuerst, dann nach `nextBillDate`

### Task 2.2: CSV-Parser

`src/lib/csv-parser.ts`:

```typescript
import Papa from 'papaparse';
import { Result, ok, err } from './result';

export interface RawTransaction {
  localId: number;
  date: string;
  amount: number;
  currency: string;
  description: string;
  counterparty: string;
}

export function parseRevolutCsv(
  csvText: string
): Result<RawTransaction[]> {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    return err(new Error(`CSV parse errors: ${result.errors[0].message}`));
  }

  // Revolut CSV columns (May 2026 format):
  // "Type", "Product", "Started Date", "Completed Date",
  // "Description", "Amount", "Fee", "Currency", "State", "Balance"
  const transactions: RawTransaction[] = [];
  for (let i = 0; i < result.data.length; i++) {
    const row = result.data[i] as Record<string, string>;
    const date = row['Completed Date'] || row['Started Date'];
    const amount = parseFloat(row['Amount']);
    if (!date || isNaN(amount)) continue;

    transactions.push({
      localId: i,
      date: normalizeDate(date),
      amount,
      currency: row['Currency'] || 'EUR',
      description: row['Description'] || '',
      counterparty: extractCounterparty(row['Description']),
    });
  }
  return ok(transactions);
}

function normalizeDate(input: string): string {
  // Convert "2026-05-03 14:23:11" to ISO 8601
  return new Date(input).toISOString();
}

function extractCounterparty(description: string): string {
  // Heuristik: first 30 chars, normalized
  return description.slice(0, 30).toUpperCase().trim();
}
```

**Wichtig**: Da Revolut sein CSV-Format gelegentlich ändert, baue Tolerance:
- Bei fehlenden Spalten: User-Mapping-UI anbieten
- Bei unbekannten Spalten: ignorieren statt erroren

### Task 2.3: Categorizer Stufe 1 (Lookup)

`src/modules/categorizer/lookup.ts`:

```typescript
import { CategoryRule } from '@/db/types';

export interface LookupMatch {
  category: string;
  confidence: number;  // 1.0 für exact, 0.95 für regex
  ruleId: string;
}

export function lookup(
  counterparty: string,
  rules: CategoryRule[]
): LookupMatch | null {
  // Exact matches first (highest confidence)
  for (const rule of rules.filter(r => r.matchType === 'exact')) {
    if (rule.counterpartyPattern === counterparty.toUpperCase()) {
      return {
        category: rule.category,
        confidence: 1.0,
        ruleId: rule.id,
      };
    }
  }

  // Regex matches second
  for (const rule of rules.filter(r => r.matchType === 'regex')) {
    try {
      const regex = new RegExp(rule.counterpartyPattern, 'i');
      if (regex.test(counterparty)) {
        return {
          category: rule.category,
          confidence: 0.95,
          ruleId: rule.id,
        };
      }
    } catch {
      continue; // skip invalid regex
    }
  }

  return null;
}
```

### Task 2.4: Categorizer Stufe 2 (LLM)

`src/modules/categorizer/llm.ts`:

```typescript
import { callClaude } from '@/services/claude';
import { anonymizeCounterparty } from '@/lib/anonymize';
import { Result, ok, err } from '@/lib/result';

const SYSTEM_PROMPT = `[siehe llm-prompts.md Use-Case 1]`;

export interface LlmCategorization {
  localId: number;
  category: string;
  confidence: number;
  warning: string | null;
}

export async function categorizeBatch(
  transactions: RawTransaction[]
): Promise<Result<LlmCategorization[]>> {
  const anonymized = transactions.map(t => ({
    id: t.localId,
    date: t.date,
    counterparty: anonymizeCounterparty(t.counterparty),
    amount: t.amount,
  }));

  const response = await callClaude({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: JSON.stringify(anonymized) },
    ],
  });

  if (!response.ok) return response;

  const text = response.value.content[0].text;
  return parseResponse(text);
}
```

### Task 2.5: Categorizer Orchestrator

`src/modules/categorizer/index.ts`:

```typescript
export async function categorizeTransactions(
  transactions: RawTransaction[]
): Promise<Result<CategorizedTransaction[]>> {
  // Load rules
  const rulesResult = await categoryRulesRepo.findAll();
  if (!rulesResult.ok) return rulesResult;
  const rules = rulesResult.value;

  // Stage 1: Lookup
  const stage1: CategorizedTransaction[] = [];
  const unknown: RawTransaction[] = [];

  for (const tx of transactions) {
    const match = lookup(tx.counterparty, rules);
    if (match) {
      stage1.push({
        ...tx,
        category: match.category,
        confidence: match.confidence,
        source: 'lookup',
        ruleId: match.ruleId,
      });
      // Increment hitCount async (fire-and-forget)
      void categoryRulesRepo.incrementHitCount(match.ruleId);
    } else {
      unknown.push(tx);
    }
  }

  // Stage 2: LLM Batch (only if there are unknowns)
  if (unknown.length === 0) return ok(stage1);

  const llmResult = await categorizeBatch(unknown);
  if (!llmResult.ok) return llmResult;

  const stage2 = unknown.map((tx, i) => {
    const llm = llmResult.value.find(l => l.localId === tx.localId);
    if (!llm) {
      return { ...tx, category: 'sonstiges', confidence: 0.0,
               source: 'fallback' };
    }
    return {
      ...tx,
      category: llm.category,
      confidence: llm.confidence,
      source: 'llm',
      warning: llm.warning,
    };
  });

  // Save new rules from confident LLM results (>= 0.9)
  for (const tx of stage2.filter(t => t.confidence >= 0.9)) {
    await categoryRulesRepo.upsert({
      id: generateId(),
      counterpartyPattern: tx.counterparty,
      matchType: 'exact',
      category: tx.category,
      createdBy: 'ai',
      hitCount: 1,
      lastUsed: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
  }

  return ok([...stage1, ...stage2]);
}
```

### Task 2.6: User-Review-UI (Stufe 3)

`src/components/feature/import/ReviewSwipeView.tsx`:
- Card-Stack mit unsicheren Transaktionen
- Pro Card: Datum, Counterparty, Betrag, AI-Vorschlag
- 12 Buttons mit Kategorien (Grid 3x4)
- Tap auf Kategorie → speichert User-Korrektur, schreibt neue Rule
- Swipe-Right = AI-Vorschlag bestätigen, Swipe-Left = anders kategorisieren

### Task 2.7: CSV-Import-Flow

`src/views/Import.tsx`:
- Drag-and-Drop oder File-Picker
- Loading-State während Categorizer läuft
- Stage-1-Result: "62/80 automatisch kategorisiert"
- Stage-2-Loading: "Sende 18 zur Analyse..."
- Stage-3: Review-UI für unsichere
- Final: "Import abgeschlossen. 80 Transaktionen erfasst."

### Task 2.8: Insights-View

`src/views/Insights.tsx`:
- Tab-Switch: "Aktueller Monat" / "Letzte 3 Monate"
- Pie-Chart pro Kategorie (Recharts)
- Liste der Kategorien mit Summe und % vom Gesamt
- Klick auf Kategorie → Drill-Down in Transaktions-Liste

### Task 2.9: Anomalie-Detection

`src/modules/categorizer/anomalies.ts`:

```typescript
export function detectAnomalies(
  transactions: CategorizedTransaction[]
): string[] {
  const anomalies: string[] = [];

  // Doppelte Abbuchungen am selben Tag
  const grouped = groupBy(transactions,
    t => `${t.date.slice(0, 10)}-${t.amount}`);
  for (const [key, group] of grouped) {
    if (group.length >= 2 && group[0].amount < 0) {
      anomalies.push(`Doppelte Abbuchung am ${key}`);
    }
  }

  // Neue wiederkehrende Buchungen
  const monthlyRecurring = findMonthlyRecurring(transactions);
  for (const recur of monthlyRecurring) {
    if (!isKnownSubscription(recur.counterparty)) {
      anomalies.push(
        `Mögliches neues Abo: ${recur.counterparty} ${recur.amount}€`);
    }
  }

  return anomalies;
}
```

### Task 2.10: Tests

`tests/modules/categorizer/lookup.test.ts`:
- Exact match → confidence 1.0
- Regex match → confidence 0.95
- No match → null
- Invalid regex → skipped

`tests/lib/csv-parser.test.ts`:
- Valid Revolut CSV → korrekte Transaction-Liste
- Fehlerhafte CSV → Error mit hilfreichem Text
- Leere CSV → leere Liste, kein Error

## Out of Scope

- ❌ Investment-Tracking (Sprint 3)
- ❌ AI-Empfehlungen (Sprint 4)

## Erwartete Probleme

**Problem**: Revolut CSV-Format ändert sich.
**Lösung**: Beim ersten unverstandenen Format zeigen wir User-Mapping-UI:
"Welche Spalte ist Datum? Welche Betrag?"

**Problem**: Claude-Output ist nicht valides JSON.
**Lösung**: Strict-Parser mit Retry. Bei zweitem Fail: Fallback auf
"sonstiges" mit Warnung.

**Problem**: Counterparty enthält Sonderzeichen die Regex brechen.
**Lösung**: Regex-Engine mit try/catch wrappen, bei Fehler skip.
