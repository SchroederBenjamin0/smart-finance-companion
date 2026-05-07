# Sprint 4: AI-Advisor & Notifications (Wochen 7-8)

## Ziel

Vollständiger AI-Advisor mit monatlichen Empfehlungen, lokale Notifications,
News-Filter mit Marketaux + Claude Haiku, Watchdog-Tasks beim App-Open.

## Definition of Done

✅ Monatliche Sparplan-Empfehlung wird automatisch beim ersten App-Open
   im neuen Monat generiert
✅ Empfehlung wird mit Begründung in UI angezeigt
✅ User kann annehmen, anpassen oder skippen
✅ Lokale Notifications werden zum 1. des Monats geplant
✅ News-Watchdog läuft beim App-Open (max 1x/Tag)
✅ Haiku-Filter erkennt materielle News, andere werden verworfen
✅ Quartals-Insight wird zum Quartalsstart generiert (Markdown)
✅ Anomalie-Banner zeigen Markt-Events an (ohne Aktions-Trigger)
✅ Settings zeigen API-Kosten-Tracking

## Tasks

### Task 4.1: Marketaux-Service

`src/services/marketaux.ts`:

```typescript
import { Result, ok, err } from '@/lib/result';
import { getSecret } from '@/db/repositories/secrets';

interface MarketauxArticle {
  uuid: string;
  title: string;
  description: string;
  url: string;
  published_at: string;
  source: string;
  entities: { symbol: string; name: string }[];
}

export async function fetchNewsByTickers(
  tickers: string[]
): Promise<Result<MarketauxArticle[]>> {
  const keyResult = await getSecret('marketaux_key');
  if (!keyResult.ok) return ok([]); // optional service

  const url = new URL('https://api.marketaux.com/v1/news/all');
  url.searchParams.set('symbols', tickers.join(','));
  url.searchParams.set('language', 'en,de');
  url.searchParams.set('limit', '3');
  url.searchParams.set('api_token', keyResult.value);

  const response = await fetch(url.toString());
  if (!response.ok) {
    return err(new Error(`Marketaux ${response.status}`));
  }
  const data = await response.json();
  return ok(data.data ?? []);
}
```

### Task 4.2: News-Relevanz-Filter (Haiku)

`src/modules/watchdog/news-filter.ts`:

```typescript
import { callClaude } from '@/services/claude';

const SYSTEM_PROMPT = `[siehe llm-prompts.md Use-Case 3]`;

export async function filterRelevance(
  ticker: string,
  article: MarketauxArticle
): Promise<Result<{ relevant: boolean; category: NewsCategory;
                   reason: string }>> {
  const userMsg = `
Ticker: ${ticker}
Headline: ${article.title}
Beschreibung: ${article.description ?? '(keine)'}
Quelle: ${article.source}
Datum: ${article.published_at}
  `.trim();

  const response = await callClaude({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  });

  if (!response.ok) return response;

  const text = response.value.content[0].text;
  return parseRelevanceResponse(text);
}
```

### Task 4.3: AI-Advisor (monthly)

`src/modules/advisor/monthly.ts`:

```typescript
import { callClaude } from '@/services/claude';

const SYSTEM_PROMPT = `[siehe llm-prompts.md Use-Case 2]`;

export async function generateMonthlyRecommendation(
  availableEur: number,
  portfolio: Portfolio,
  target: AllocationTarget
): Promise<Result<Recommendation>> {
  const userMsg = buildUserMessage(availableEur, portfolio, target);

  const response = await callClaude({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  });

  if (!response.ok) return response;

  const parsed = parseAdvisorResponse(response.value.content[0].text);
  if (!parsed.ok) return parsed;

  // Persist
  const recommendation: Recommendation = {
    id: generateId(),
    date: new Date().toISOString(),
    trigger: 'monthly',
    availableAmount: availableEur,
    suggestionJson: JSON.stringify(parsed.value),
    rationale: parsed.value.summary,
    status: 'pending',
    userActionAt: null,
  };

  await recommendationsRepo.create(recommendation);

  // Track cost
  await logApiCost(response.value.usage, 'claude-sonnet-4-6');

  return ok(recommendation);
}
```

### Task 4.4: Quarterly Insight (Opus)

`src/modules/advisor/quarterly.ts`:

Output ist Markdown statt JSON, weil Erzähltext mehr Wert hat als
strukturiertes Format.

```typescript
export async function generateQuarterlyInsight(
  portfolio: Portfolio,
  ninetyDaysOfNews: NewsEvent[]
): Promise<Result<string>> {
  const userMsg = buildQuarterlyMessage(portfolio, ninetyDaysOfNews);

  const response = await callClaude({
    model: 'claude-opus-4-7',
    max_tokens: 3000,
    system: QUARTERLY_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  });

  if (!response.ok) return response;
  return ok(response.value.content[0].text);
}
```

Display in `src/views/QuarterlyInsight.tsx` mit Markdown-Renderer
(z.B. `react-markdown`).

### Task 4.5: Watchdog-Orchestrator

`src/modules/watchdog/index.ts`:

```typescript
export async function runStartupTasks(): Promise<void> {
  const lastRun = await configRepo.get('watchdog.last_daily');

  if (shouldRunDaily(lastRun)) {
    await runDailyTasks();
    await configRepo.set('watchdog.last_daily',
                          new Date().toISOString());
  }

  const lastWeekly = await configRepo.get('watchdog.last_weekly');
  if (shouldRunWeekly(lastWeekly)) {
    await runWeeklyTasks();
    await configRepo.set('watchdog.last_weekly',
                          new Date().toISOString());
  }

  // Monthly recommendation
  const now = new Date();
  if (now.getDate() === 1) {
    const exists = await recommendationsRepo
      .findByMonth(now.getFullYear(), now.getMonth());
    if (!exists) {
      void generateMonthlyRecommendation(/* ... */);
    }
  }

  // Quarterly insight
  if (isFirstDayOfQuarter(now)) {
    const exists = await getQuarterlyInsight(now);
    if (!exists) {
      void generateQuarterlyInsight(/* ... */);
    }
  }
}

async function runDailyTasks(): Promise<void> {
  await runMarketCheck();
  await runNewsCheck();
}

async function runWeeklyTasks(): Promise<void> {
  await runSubscriptionAudit();
}
```

In `src/App.tsx`:

```tsx
useEffect(() => {
  void runStartupTasks();
}, []);
```

### Task 4.6: Lokale Notifications

`src/lib/notifications.ts`:

```typescript
export async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export async function scheduleMonthlyReminder(): Promise<void> {
  if (Notification.permission !== 'granted') return;

  // Service Worker scheduling via Notification Triggers
  // (works in Chrome, partial support iOS Safari)
  const reg = await navigator.serviceWorker.ready;

  const nextMonth = getFirstOfNextMonth();
  nextMonth.setHours(19, 0, 0, 0);

  // Note: Notification Triggers API is experimental
  // Fallback: bei jedem App-Open prüfen ob Reminder fällig
  await reg.showNotification('Sparplan-Check', {
    body: 'Es ist der 1. des Monats. Schau dir deinen Vorschlag an.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'monthly-recommendation',
    showTrigger: new TimestampTrigger(nextMonth.getTime()),
  } as any);
}
```

**Wichtig**: Notification Triggers API ist auf iOS noch nicht stabil.
Fallback-Strategie:
- Beim App-Open prüfen: "Ist heute der 1.? Empfehlung schon angeschaut?"
- Wenn nein → Top-Banner in Dashboard "Mai-Empfehlung wartet"

### Task 4.7: Recommendation-View

`src/views/Recommendation.tsx` nach `ui-flows.md`:
- Card mit Vorschlag-Aufteilung
- "In TR öffnen"-Button (Universal-Link mit erstem ETF)
- "Anpassen"-Button (Modal mit Slider pro Position)
- "Skip"-Button (status → 'skipped')
- Nach Confirm: Status → 'accepted', Allocations werden eingebucht

### Task 4.8: Anomalie-Banner

`src/components/feature/dashboard/AnomalyBanner.tsx`:
- Markt-Anomalien aus Watchdog
- Format: "NVIDIA -8% gestern. Information, kein Trigger zum Handeln."
- Dismissible (mit `userDismissed` flag)
- Maximal 3 gleichzeitig sichtbar

### Task 4.9: API-Cost-Tracking

`src/lib/cost-tracker.ts`:

```typescript
const PRICING_USD_PER_1M = {
  'claude-haiku-4-5':   { input: 1.0, output: 5.0 },
  'claude-sonnet-4-6':  { input: 3.0, output: 15.0 },
  'claude-opus-4-7':    { input: 15.0, output: 75.0 },
};

export async function logApiCost(
  usage: { input_tokens: number; output_tokens: number },
  model: string
): Promise<void> {
  const pricing = PRICING_USD_PER_1M[model];
  if (!pricing) return;

  const inputCost = (usage.input_tokens / 1_000_000) * pricing.input;
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.output;
  const totalUsd = inputCost + outputCost;
  const totalEur = totalUsd * 0.92; // approximation

  await appLogRepo.add({
    timestamp: new Date().toISOString(),
    level: 'info',
    module: 'claude',
    message: `API call: ${model}`,
    contextJson: JSON.stringify({
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costEur: totalEur,
    }),
  });
}

export async function getMonthlyApiCost(
  year: number, month: number
): Promise<number> {
  const logs = await appLogRepo.findByMonth('claude', year, month);
  return logs.reduce((sum, log) => {
    const ctx = JSON.parse(log.contextJson ?? '{}');
    return sum + (ctx.costEur ?? 0);
  }, 0);
}
```

In Settings-View: "API-Kosten diesen Monat: X,XX €"

### Task 4.10: Tests

- News-Relevanz-Filter Mock-Tests
- Watchdog-Trigger-Logik (shouldRunDaily, shouldRunWeekly)
- Recommendation-Persistence
- Cost-Calculation

## Out of Scope (Future)

- ❌ Steuer-Optimierungs-Modul (Sprint 5+)
- ❌ Apple Watch Companion (zu komplex für PWA)
- ❌ Multi-User-Setup (regulatorisch out of scope)

## Erwartete Probleme

**Problem**: Notification Triggers API funktioniert auf iOS Safari nicht.
**Lösung**: Server-Push wäre die saubere Lösung, aber wir wollen kein Hosting.
Fallback: Check-on-Open mit Banner-Indicator. Du musst die App öffnen
um zu sehen "es liegt was vor".

**Problem**: Marketaux Free-Tier-Limit erreicht.
**Lösung**: Cache pro Tag aggressiv. Bei Limit: zeige "Quota erreicht.
Reset um Mitternacht UTC."

**Problem**: Quartals-Insight kostet 0,15 €.
**Lösung**: Akzeptieren, wir haben nur 4 pro Jahr. Kein Optimierungsbedarf.

**Problem**: Claude liefert nicht-valides JSON.
**Lösung**: Strict-Parser mit einem Retry. Bei zweitem Fail: Empfehlung
als "failed" markieren, User-Notification.
