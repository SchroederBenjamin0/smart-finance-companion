# Smart Finance Companion — App-Verbesserungen

**Datum:** 2026-05-11
**Status:** Freigegeben zur Implementierung
**Scope:** 12 Features, gegliedert in 3 sequenziell zu implementierende Batches

---

## Übersicht

Erweiterung der bestehenden PWA um 12 Verbesserungen aus dem internen Review vom 2026-05-11. Die Features sind nach Risiko/Wichtigkeit in drei Batches gegliedert. Nach jedem Batch erfolgt ein User-Review, bevor der nächste startet.

**Explizit nicht im Scope** (zur Vollständigkeit dokumentiert, damit das Spec eindeutig ist):

- Secrets-Verschlüsselung in IndexedDB (Single-User-PWA, akzeptables Risiko gegenüber API-Cap 20 €)
- Sparziel-Fortschrittsbalken, Subscription-Kostenprognose 12 Monate, What-If-Slider
- Gig-Tracker, Steuer-Rücklagen-Konto (Kleinunternehmerregelung), Lexware-Export
- Monatlicher Markdown-Report (kein Obsidian-Workflow)
- Service-Tests (Claude/Yahoo/Marketaux), Result-Pattern-Refactor

## Implementierungs-Reihenfolge

| Batch | Inhalt | Pull-Request | Plan-Doc |
|---|---|---|---|
| **1** | Push-Notifications, Console-Log-Gating, CSV-Hash + Retention | nach Batch | `2026-05-11-batch-1-plan.md` |
| **2** | Spending-View + `nightlife`-Kategorie, Verleih-Tracker | nach Batch | `2026-05-11-batch-2-plan.md` |
| **3** | Drift-Visualisierung, Anomaly-UI, Share-Sheet, Dark Mode, ETF-Backtesting, Auto-Backup + Restore, Cashflow-Vorhersage | nach Batch | `2026-05-11-batch-3-plan.md` |

Implementierung erfolgt strikt sequenziell. Nach jedem Batch: User-Review → Merge → nächster Batch.

---

## Konsolidierte Datenmodell-Änderungen

Alle Änderungen fallen in IndexedDB `smart-finance` DB. **DB-Version-Bump** auf `2` für Migration.

### Neue Stores

#### `loans` (Batch 2)
```ts
interface Loan {
  id: string;
  borrowerName: string;           // freitext, Pflichtfeld
  itemDescription: string;        // freitext, Pflichtfeld
  lentAt: string;                 // ISO date
  amount?: number;                // optional
  paymentMethod?: 'cash' | 'transfer';
  status: 'lent' | 'returned';
  returnedAt?: string;            // ISO, gesetzt bei Status-Flip
  createdAt: string;
}
```
Indexes: `by-status` (für Filter „nur offene"), `by-lentAt`.

#### `notificationLog` (Batch 1)
```ts
interface NotificationLogEntry {
  id: string;
  type: 'allocation' | 'subscription' | 'drift' | 'anomaly' | 'cashflow';
  dedupeKey: string;              // siehe Push-Notifications-Sektion
  firedAt: string;
}
```
Indexes: `by-dedupeKey` (Existenz-Check vor Fire), `by-firedAt` (Cleanup).

#### `priceCache` (Batch 3)
```ts
interface PriceCacheEntry {
  ticker: string;                 // primary key
  monthlyCloses: Array<{ date: string; close: number }>;
  fetchedAt: string;
  ttlHours: 24;
}
```
Single record pro Ticker. Wird beim Backtest geprüft, bei Cache-Miss oder `>24h` neu gefetcht.

### Erweiterte Stores

#### `transactions`
```diff
  interface Transaction {
    ...
+   transactionHash: string;      // SHA-256(date|cents|counterpartyNormalized)
+   isAnomaly: number;            // 0/1
  }
```
Neuer Index: `by-hash` (unique).

**Hash-Definition:**
```
input = `${ISO-date}|${Math.round(amount*100)}|${counterparty.trim().toLowerCase().replace(/\s+/g, ' ')}`
hash = SHA-256(input) → hex
```

#### `csvImports`
```diff
  interface CSVImport {
    ...
+   expiresAt: string;            // createdAt + 30 days, ISO
  }
```
Bestehendes `anomalies: string[]` wird für Anomaly-Banner-Trigger genutzt.

#### `appConfig` — neue Keys
```diff
  export const ALL_CONFIG_KEYS = {
    ...
+   notificationsEnabled: 'notifications_enabled',         // 'true' | 'false'
+   notificationsTriggers: 'notifications_triggers',       // JSON: { a, b, c, e, f: boolean }
+   driftToleranceGlobal: 'drift_tolerance_pp',            // number 1-10
+   cashflowFunWarnThreshold: 'cashflow_fun_warn_threshold', // number, default 100
  };
```
`lastBackup` und `themeOverride` existieren bereits — wir nutzen sie wieder.

### Migration (Schema v1 → v2)

1. Add stores `loans`, `notificationLog`, `priceCache`.
2. Re-create `transactions`-store-via-upgrade-handler: existing rows get computed `transactionHash` und `isAnomaly = 0`. Hash-Index aufbauen.
3. `csvImports`: `expiresAt = importedAt + 30d` für existierende Rows.
4. `appConfig`-Keys werden Lazy gesetzt (Default-Werte, falls Key fehlt).

---

## Batch 1: Kritische Fixes

### 1.1 Push-Notifications (Feature #2)

**Akzeptierte Trigger:**

| Code | Trigger | Wann gefeuert | Dedupe-Key |
|---|---|---|---|
| a | Monatliche Allokations-Erinnerung | im Watchdog: `today.getDate() === 1` ODER (heute > 1. UND keine `incomeEntry.date >= startOfMonth`) | `allocation-{YYYY-MM}` |
| b | Fällige Subscriptions | für jedes aktive Abo mit `0 ≤ daysUntil(nextBillDate) ≤ 3` | `sub-{id}-{nextBillDate}` |
| c | Portfolio-Drift überschritten | für Position mit `\|currentWeight − target\| > globalTolerance` | `drift-{positionId}-{YYYY-MM}` |
| e | Anomalie beim CSV-Import | direkt nach Import, falls `csvImport.anomalies.length > 0` | `anomaly-{csvImportId}` |
| f | Cashflow-Warnung | Forecast laufen, falls Fun-Konto < `cashflowFunWarnThreshold` in nächsten 30 Tagen | `cashflow-{ISO-Woche}` |

**Trigger #d (LLM-Sparplan-Empfehlung) ist explizit ausgeschlossen** — User checkt das beim nächsten App-Öffnen ohne Notification.

**iOS-PWA-Verhalten:** Notifications feuern nur, wenn die App geöffnet oder der Service-Worker aktiv ist. „Überfällige" Notifications werden beim nächsten App-Open nachgeholt mit Vermerk „seit X Tagen offen". Dies ist akzeptiert.

**Settings-UI** (`src/views/Settings.tsx` Erweiterung):

```
[Section: Notifications]
  [Toggle: Notifications aktivieren] → Notification.requestPermission()
    Status: granted / denied / default
    Bei denied: kleiner Hinweis „in iOS-Einstellungen aktivieren"
  
  [Sub-Toggles, nur wenn enabled = true]
    [✓] Monatliche Allokations-Erinnerung
    [✓] Subscriptions (3 Tage vor Abbuchung)
    [✓] Portfolio-Drift
    [✓] Anomalie beim Import
    [✓] Cashflow-Warnung
```

**Watchdog-Integration:**

Neuer Phase in `src/modules/watchdog/index.ts` am Ende von `runStartupTasks()`:
```ts
await dispatchPendingNotifications();
```

`dispatchPendingNotifications()` lebt in neuem Modul `src/modules/notifications/index.ts`:
1. Lade `notifications_enabled` + `notifications_triggers`.
2. Pro aktiviertem Trigger: Bedingung prüfen → wenn erfüllt UND `notificationLog` enthält dedupeKey nicht: fire + log.
3. Fire via `ServiceWorkerRegistration.showNotification(title, options)` mit `{ tag: dedupeKey, badge, icon, body, data: { route } }`.

**Service-Worker** (vite-plugin-pwa generates `dist/sw.js`):
- Erweitern um `notificationclick`-Handler:
  ```js
  self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    e.waitUntil(clients.openWindow(e.notification.data.route ?? '/'));
  });
  ```
- Konfiguration in `vite.config.ts` → `injectManifest` falls Custom-SW, oder `additionalManifestEntries` falls generated.

**Akzeptanzkriterien:**

- [ ] Settings-Toggle hat 3 Zustände (default / granted / denied) und zeigt Status korrekt.
- [ ] Bei aktiviertem Trigger a wird am 1. des Monats genau eine Notification gefeuert (nicht mehrfach pro Tag).
- [ ] Dedupe funktioniert: wiederholtes Öffnen der App am selben Tag feuert nicht erneut.
- [ ] Bei aufgeklärter Drift (Position wieder in Toleranz): nächster Auslöser im neuen Monat funktioniert.
- [ ] Pure-Function-Tests für `shouldFire(trigger, state, log)` (siehe Tests-Sektion).

### 1.2 Console.logs entfernen (Feature #3)

**Neuer Helper** `src/lib/debug.ts`:
```ts
export function debug(...args: unknown[]): void {
  if (import.meta.env.DEV) console.log(...args);
}

export function debugError(...args: unknown[]): void {
  if (import.meta.env.DEV) console.error(...args);
}
```

**Zu refactorende Dateien** (laut Repo-Scan):

1. `src/db/client.ts`
2. `src/services/trPdfImport.ts`
3. `src/components/feature/onboarding/ApiKeysStep.tsx`
4. (+ 2 weitere — beim Refactor identifizieren)

**Regel:** Alle `console.log` → `debug`. `console.error` für tatsächliche Fehler bleibt (Logging im Produktivbetrieb sinnvoll), `console.error` für Debug → `debugError`.

**Akzeptanzkriterien:**

- [ ] Lighthouse Audit Console-Log-Free im Production-Build.
- [ ] Im DEV-Mode noch alle Logs sichtbar.
- [ ] Grep `grep -rn 'console\.log' src/` liefert 0 Treffer (außer in `debug.ts` selbst).

### 1.3 CSV-Schutz + 30-Tage-Cleanup (Feature #6)

**Hash-Berechnung** (vor Insert für jede Transaktion):
```ts
async function computeTransactionHash(tx: { date: string; amount: number; counterparty: string }): Promise<string> {
  const normalized = `${tx.date}|${Math.round(tx.amount * 100)}|${tx.counterparty.trim().toLowerCase().replace(/\s+/g, ' ')}`;
  const buf = new TextEncoder().encode(normalized);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

**Repo-Erweiterung** `src/db/repositories/transactions.ts`:
- `upsertMany(rows)` prüft pro Row: `existing = await db.getFromIndex('transactions', 'by-hash', hash)`. Falls vorhanden → skip + Counter++. Sonst: insert.
- Rückgabe erweitert um `{ inserted: number, skipped: number }`.

**Import-Summary-UI:**
- Bestehende CSV-Import-Confirmation-Modal um Zeile „X Duplikate übersprungen" erweitern.

**Cleanup-Job** in `src/modules/watchdog/index.ts`:
```ts
async function runRetentionCleanup(): Promise<void> {
  await csvImportsRepo.cleanExpired();     // löscht csvImports mit expiresAt < now
  await notificationLogRepo.cleanOlderThan(90); // löscht notificationLog älter als 90 Tage
}
```
- Wird einmal pro 24h via `lastWatchdogRun`-Throttle ausgeführt (gleiche Cadence wie News-Fetch).

**Wichtig — was bleibt, was geht:**
- **Bleibt unangetastet:** alle `transactions` (inkl. `transactionHash`), alle `categoryRules`.
- **Wird nach 30 Tagen gelöscht:** alle `csvImports`-Metadaten (Filename, importedAt, anomalies-Array, etc.). Es werden keine Roh-CSV-Bytes gespeichert (bereits jetzt nicht der Fall).
- **Wird nach 90 Tagen gelöscht:** alle `notificationLog`-Einträge.

**Akzeptanzkriterien:**

- [ ] Wiederholter Import derselben CSV erzeugt 0 neue Transaktionen.
- [ ] Überlappende Imports (z.B. Jan-CSV + Jan-Feb-CSV) erzeugen nur die nicht-überschneidenden Transaktionen.
- [ ] Cleanup-Job läuft idempotent (mehrfaches Aufrufen löscht keine zusätzlichen Rows).
- [ ] Hash-Migration für bestehende Transaktionen läuft im DB-Upgrade-Handler.
- [ ] Pure-Function-Tests für `computeTransactionHash` mit bekannten Inputs.

---

## Batch 2: Neue Features

### 2.1 Feature A — LLM-Kategorisierung + Spending-View

**Anpassung am bestehenden Categorizer:**

1. **Neue Kategorie `nightlife`** in `VALID_CATEGORIES` einfügen:
   - Inhaltlich: Clubs, Bars, Spätis nach Mitternacht, Türen-/Eintrittsgebühren.
   - Restaurants-Kategorie bleibt für tatsächliches Essen (inkl. Coffee Shops, Lieferdienste).
   - `SYSTEM_PROMPT` (`src/modules/categorizer/index.ts:134`) entsprechend updaten — `restaurants` verliert „Bars, Clubs", `nightlife` neu mit klarer Beschreibung.
2. **Seed-Rules** in `src/modules/categorizer/seedRules.ts` ergänzen für deutsche Clubs und Bars (z.B. Patterns für „Club", „Bar", „Cocktail", „Späti").
3. **Migration:** Bestehende Transaktionen mit Kategorie `restaurants` werden NICHT automatisch umkategorisiert — User kann via „Mit LLM neu prüfen" (siehe unten) manuell triggern.

**Manuelle Re-Categorize-Action:**

In der bestehenden Transaction-Review-UI (nach CSV-Import) und in der neuen Spending-View:
- Button „Mit LLM neu prüfen" für ausgewählte oder alle Zeilen mit `categoryConfidence < 0.7`.
- Ruft bestehendes `categorize()` mit forciertem LLM-Pfad (Stage-1-Lookup wird übersprungen).

**Spending-View (neuer Tab in Stats):**

`src/views/Stats.tsx` bekommt Tab-Navigation:
```
[ Übersicht ] [ Top-Kategorien ] [ Cashflow ]   ← Cashflow kommt in Batch 3
```

**Tab „Top-Kategorien":**
- Zeitraum-Selector: `30 Tage | 90 Tage | 365 Tage | Alle`.
- Tabelle, sortiert nach `total` absteigend:

| Kategorie | Total | Anzahl TX | Top-Counterparty |
|---|---|---|---|
| `nightlife` | 312,50 € | 14 | „Circle Club" (4×) |
| `lebensmittel` | 287,90 € | 22 | „REWE" (12×) |
| ... | ... | ... | ... |

- Click auf Zeile → Drilldown-Sheet mit allen Transaktionen dieser Kategorie im Zeitraum, sortiert nach Datum desc.
- Drilldown hat „Mit LLM neu prüfen"-Button für markierte Zeilen.

**Akzeptanzkriterien:**

- [ ] `nightlife` ist als 13. Kategorie in `VALID_CATEGORIES` und im Prompt.
- [ ] Neue CSV-Imports mit Club-Counterparty landen in `nightlife` (LLM-Test) oder Seed-Rule-Hit.
- [ ] Spending-View aggregiert korrekt nach gewähltem Zeitraum (Pure-Function-Test).
- [ ] Re-Categorize-Button feuert LLM-Call nur für ausgewählte Zeilen.
- [ ] Existierende `restaurants`-Transaktionen werden nicht automatisch verschoben.

### 2.2 Feature B — Verleih-Tracker

**Datenmodell:** Siehe `loans`-Store oben.

**UI-Placement:** Neue Section in `src/views/Settings.tsx`, collapsed by default falls leer:
```
[Section: Verleih (▶ collapsed wenn leer)]
  [+ Neu]
  
  [Liste der offenen Verleihe]
    Max — JBL Box — seit 10.11. — [verliehen ▼] [✏️] [🗑️]
    
  [Liste der zurückbekommenen, kollabierbar]
```

**„+ Neu"-Modal:**
- Name (Text, Pflichtfeld)
- Item (Text, Pflichtfeld)
- Datum geliehen (Date, default heute)
- [ ] „Geld erwarte ich zurück" → bei aktiv:
  - Betrag (Number)
  - Radio: ⚪ bar  ⚪ überweisung

**Status-Toggle „Zurückbekommen":**
- Wenn `paymentMethod === undefined` oder `=== 'cash'`: nur Status auf `returned` setzen + `returnedAt = now`.
- Wenn `paymentMethod === 'transfer'`: Confirm-Modal „Wurde überwiesen? Wird auf Fun-Konto gebucht." → bei Bestätigung:
  - Status flippen.
  - Neue `Transaction` einfügen:
    ```ts
    {
      id, date: today, amount: +X,
      counterparty: loan.borrowerName,
      category: 'einkommen',
      description: `Rückzahlung: ${loan.itemDescription}`,
      categoryConfidence: 1.0,
      isUserReviewed: 1,
      sourceCsvId: 'manual-loan-return',
      importedAt: now,
      transactionHash: computeHash(...),
      isAnomaly: 0
    }
    ```
  - **Wichtig:** Geht NICHT durch die Allocation-Engine (siehe Notes oben — bestätigt vom User).

**Akzeptanzkriterien:**

- [ ] Verleih-Section sichtbar in Settings.
- [ ] „+ Neu" mit leerem `itemDescription` validiert (Pflichtfeld).
- [ ] Status-Flip ohne Geld-Komponente: nur DB-Update, keine Transaktion.
- [ ] Status-Flip mit `paymentMethod = transfer`: Confirm-Dialog erscheint, bei Bestätigung wird Transaktion eingefügt.
- [ ] Kein Auto-Match mit bestehenden Banktransaktionen.
- [ ] Pure-Function-Test für `buildReturnTransaction(loan)`.

---

## Batch 3: Rest

### 3.1 Drift-Visualisierung (Feature #4)

**UI:** In `src/views/Investments.tsx` pro Position-Card horizontaler Balken:

```
[BTC ━━━━━━━━━━━━━━━━━━━━━━━━]   18% / Ziel 10% ±5%
       │░░░░░░░░░░░░░░░░░░░░░░▼│
        5%   10%   15%   20%   ← Toleranzband schattiert
```

- Bar-Breite: 220px max
- Marker für `currentWeight`, separater Marker für `target`
- Toleranzband schattiert (`target ± tolerance`)
- Farben: grün (in Band), gelb (innerhalb 2pp über Band), rot (> 2pp über Band)

**Toleranz-Slider** in Settings:
- Range 1-10 pp, default 5
- Speichert in `drift_tolerance_pp` Config-Key
- Beeinflusst sowohl Drift-Anzeige als auch Drift-Notifications (Feature #2c)

**Akzeptanzkriterien:**

- [ ] Bar rendert korrekt für Positionen mit `targetPercentage > 0`.
- [ ] Positionen mit `targetPercentage = 0` (kein Ziel gesetzt) zeigen keinen Bar, sondern Hint „Ziel nicht gesetzt".
- [ ] Slider in Settings updated `drift_tolerance_pp` und rerendert alle Bars.

### 3.2 Anomaly-Detection UI (Feature #5)

**Modul** `src/modules/anomaly/index.ts`:

```ts
interface AnomalyResult {
  txId: string;
  amount: number;
  categoryMedian: number;
  factor: number;     // |amount| / median
}

export function detectAnomalies(
  newTxs: Transaction[],
  historicalTxs: Transaction[],
  options: { minThreshold: 50, factor: 3, minHistoryMonths: 6 }
): AnomalyResult[]
```

**Logik:**
1. Pro neuer TX: Filter historische TX auf gleiche Kategorie, letzte 6 Monate.
2. Wenn `<6 Monate` Daten in dieser Kategorie: keine Warnung (skip).
3. Berechne Median.
4. Wenn `|amount| > 3 * median` UND `|amount| > 50`: Anomalie.
5. Setze `isAnomaly = 1` auf TX-Insert.

**UI-Plätze:**
- Transaktions-Listen (Dashboard letzte 10 + ggf. neue TX-View): kleines Icon (⚠️) neben anomalen Zeilen.
- Tooltip/Tap: „Diese Ausgabe ist 3.4× höher als dein Median in dieser Kategorie (87 € vs. typisch 25 €)".
- Post-Import-Banner: „2 auffällige Ausgaben — überprüfen" → öffnet Liste mit Filter `isAnomaly = 1`.

**Akzeptanzkriterien:**

- [ ] Pure-Function-Tests für `detectAnomalies` mit:
  - Normalfall (3 Monate Historie, eine Anomalie)
  - Kategorie ohne ausreichende Historie (kein Warn)
  - Median 2 €, neue TX 6 € → kein Warn (unter 50 €-Threshold)
- [ ] Banner triggert Notification (#2e) falls Trigger e aktiv ist.

### 3.3 Share-Sheet (Feature #7)

**Manifest:**
```json
{
  "share_target": {
    "action": "/share",
    "method": "GET",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
}
```

**Route-Handler:** Neue Route `/share` in `src/App.tsx`. Parse-Logik:
```ts
function parseSharedText(text: string): { amount: number | null; note: string } {
  const m = text.match(/(-?\d+(?:[.,]\d{1,2})?)\s*€?/);
  return {
    amount: m ? Number(m[1].replace(',', '.')) : null,
    note: text,
  };
}
```

- Bei Match: Income-Modal vorbefüllt mit Betrag + Text als Notiz.
- Bei Parse-Fail: Modal mit leerem Betrag, Text in Notiz.
- Kategorie immer leer (manuelle Auswahl), Datum = heute.
- **Kein LLM-Parsing** — bewusst schnell.

**Akzeptanzkriterien:**

- [ ] `manifest.json` enthält gültiges `share_target`.
- [ ] Route `/share?text=Pizza%2012,50` öffnet Modal mit `amount=12.50`, `note="Pizza 12,50"`.
- [ ] Test installierbar auf iPhone 13 / iOS 16.4+, taucht im iOS-Share-Sheet auf (manueller Akzeptanztest).

### 3.4 Dark Mode (Feature #11)

**Tailwind-Konfiguration** (`tailwind.config.ts`):
```ts
darkMode: 'media',  // automatisch via prefers-color-scheme
```

**Token-Mapping:** Bestehende Farbtokens um `dark:`-Varianten ergänzen. Schwerpunkt:
- Hintergründe (`bg-white` → `dark:bg-zinc-900`)
- Text (`text-zinc-900` → `dark:text-zinc-100`)
- Borders (`border-zinc-200` → `dark:border-zinc-700`)
- Charts (Recharts): Theme-Variablen via CSS-Custom-Props an Recharts durchreichen.

**Manueller Toggle:** Nicht in Scope. `themeOverride` Config-Key bleibt unbenutzt — kann später ergänzt werden, falls gewünscht.

**Akzeptanzkriterien:**

- [ ] App wechselt automatisch bei System-Theme-Wechsel (manueller Akzeptanztest auf iOS).
- [ ] Keine Tailwind-Klasse ohne dark:-Variante, wo Farben verwendet werden (visueller Walkthrough aller Views).
- [ ] Recharts-Themes passen sich an (Hintergründe + Achsen lesbar im Dark Mode).

### 3.5 ETF-Backtesting (Feature #15)

**Modul** `src/modules/backtest/index.ts`:

```ts
interface BacktestInput {
  allocation: { ticker: string; weight: number }[];  // Summe weight = 1.0
  monthlyContribution: number;
  years: number;  // default 10
}

interface BacktestResult {
  series: Array<{ date: string; value: number }>;  // monatlich
  endValue: number;
  maxDrawdown: number;   // 0..1
  totalContributed: number;
}

export async function runBacktest(input: BacktestInput): Promise<Result<BacktestResult>>
```

**Logik:**
1. Pro Ticker: hole monatliche Close-Preise via `priceCache` (24h-TTL).
   - Cache-Miss / abgelaufen → Yahoo-History-Fetch (10 Jahre) + Update Cache.
2. Simuliere DCA: jeden Monat investiere `monthlyContribution × weight` in Ticker zum jeweiligen Close.
3. Aggregate Portfolio-Value pro Monat.
4. Compute `endValue` und `maxDrawdown` (max peak-to-trough Verlust).

**Cache-Repo** `src/db/repositories/priceCache.ts`:
- `get(ticker)`: returns entry if `fetchedAt > now - 24h`, else null.
- `upsert(entry)`: replace.
- `cleanStale()`: optional cleanup für Tickers, die nicht mehr in Portfolio (delegiert an Watchdog).

**UI-Integration** im Advisor-Flow:
1. User triggert „Sparplan-Empfehlung" (existierender Flow).
2. Vor LLM-Call: `runBacktest` mit aktueller Soll-Allokation läuft.
3. UI zeigt:
   - **Chart** (Recharts Line): Portfolio-Wert über Zeit + horizontale Linie für `totalContributed` (= eingezahltes Geld).
   - **KPI-Cards**: „Endwert: 14.230 €" und „Max Drawdown: -42 %".
   - **Disclaimer** prominent: „📊 Vergangenheitsdaten der letzten 10 Jahre. Keine Prognose. Märkte können sich anders verhalten."
4. Darunter: LLM-Empfehlung (Advisor-Output) — LLM bekommt `endValue` und `maxDrawdown` als Kontext im System-Prompt.

**Akzeptanzkriterien:**

- [ ] `priceCache` cached pro Ticker, TTL 24h.
- [ ] Pure-Function-Test für `simulateDCA(monthlyCloses, contribution)` mit synthetischen Daten.
- [ ] Yahoo-Fetch-Fehler eines einzelnen Tickers degradiert gracefully (return Result-Error mit Detail).
- [ ] Disclaimer-Text ist im UI sichtbar, ohne dass User scrollen muss.

### 3.6 Auto-Backup + Restore (Feature #16)

**Backup-Logik:**

`src/modules/backup/index.ts`:
```ts
interface BackupBlob {
  version: 1;
  exportedAt: string;
  data: {
    transactions: Transaction[];
    accounts: Account[];
    allocations: Allocation[];
    incomeEntries: IncomeEntry[];
    subscriptions: Subscription[];
    categoryRules: CategoryRule[];
    investmentPositions: InvestmentPosition[];
    loans: Loan[];                       // neu aus Batch 2
    recommendations: Recommendation[];
    appConfig: ConfigEntry[];            // alle KEYS aus ALL_CONFIG_KEYS
  };
  // EXPLIZIT NICHT: secrets, csvImports, notificationLog, priceCache, appLog
}

export async function buildBackup(): Promise<Result<BackupBlob>>;
export async function exportBackup(): Promise<Result<void>>;  // triggert Web Share API
export async function restoreBackup(blob: BackupBlob): Promise<Result<void>>;
```

**Trigger-Flow:**
- Watchdog: prüft `lastBackup`-Config. Wenn `> 14 Tage` alt: setze Zustand-Store-Flag `backupDue = true`.
- Dashboard: zeigt diskretes Banner „Backup fällig" mit Button „Jetzt sichern". Banner ist dismissable (verschiebt Reminder um 3 Tage).
- Klick auf „Jetzt sichern" → `exportBackup()`:
  ```ts
  const json = JSON.stringify(blob, null, 2);
  const file = new File([json], `smart-finance-backup-${ISO-date}.json`, { type: 'application/json' });
  await navigator.share({ files: [file], title: 'Smart Finance Backup' });
  // Fallback (Desktop / Share-API nicht verfügbar): data-URL download
  await configRepo.setRaw('last_backup', nowIso());
  ```

**Restore-Flow:**

In Settings → Section „Daten":
- Button „Backup importieren" → `<input type="file" accept="application/json">`.
- Validation: prüfe `version === 1`, alle Top-Level-Keys vorhanden, alle Items haben `id`.
- **Confirm-Modal:**
  ```
  ⚠️ WARNUNG
  
  Restore überschreibt ALLE aktuellen Daten:
  - 247 Transaktionen → werden ersetzt durch 312 aus Backup
  - 8 Subscriptions → werden ersetzt
  - ... (Stats pro Store)
  
  Diese Aktion ist NICHT rückgängig zu machen.
  API-Keys (Anthropic, Marketaux) bleiben unverändert
  und müssen NICHT neu eingegeben werden.
  
  Um zu bestätigen, tippe REPLACE ein:
  [ Eingabefeld _____________ ]
  
  [Abbrechen]  [Backup importieren] ← disabled bis "REPLACE" exakt eingegeben
  ```
- Bei Confirm: alle Stores (außer `secrets`) clearen, Backup-Daten reinschreiben.

**Akzeptanzkriterien:**

- [ ] Backup-Banner erscheint nach 14 Tagen ohne Backup.
- [ ] Banner dismissable mit 3-Tages-Snooze.
- [ ] Backup-JSON enthält alle aufgelisteten Stores, KEIN `secrets`-Eintrag.
- [ ] Restore-Confirm-Dialog erlaubt Import nur bei exakter „REPLACE"-Eingabe (case-sensitive).
- [ ] Restore ersetzt komplett, secrets bleiben unangetastet.
- [ ] Roundtrip-Test (Pure Function): export → restore → identische Daten.

### 3.7 Cashflow-Vorhersage (Feature #18)

**Modul** `src/modules/forecast/index.ts`:

```ts
interface ForecastInput {
  accounts: Account[];
  subscriptions: Subscription[];
  transactions: Transaction[];      // letzte 90 Tage für Median-Berechnung
  incomeEntries: IncomeEntry[];     // letzte 90 Tage
  weeks: 13;                        // 13 ISO-Wochen = ~91 Tage
}

interface WeeklyForecast {
  weekStartIso: string;
  funBalance: number;
  savingsBalance: number;
  investmentBalance: number;
  events: Array<{ type: 'subscription' | 'expected_income'; amount: number; label: string }>;
}

export function forecastCashflow(input: ForecastInput): WeeklyForecast[]
```

**Logik:**
1. Start-Balances aus `accounts`.
2. Pro Woche `w = 1..13`:
   - Income: regelmäßige (z.B. Gehalt am Anfang des Monats — aus letzten 90 Tagen `incomeEntries` ableiten via Median-Date-of-Month) + DJ-Median (Median der letzten 3 Monate `dj_gig`-Einnahmen, gleichmäßig auf 4 Wochen pro Monat verteilt).
   - Fixe Ausgaben: alle Subscriptions, deren `nextBillDate` in Woche `w` fällt.
   - Variable Ausgaben: pro Kategorie Median der letzten 90 Tage (geteilt durch 13 Wochen, summiert).
   - Allocation-Regeln auf Einnahmen anwenden → splitten auf Fun/Savings/Investment.
3. Return Liste von 13 `WeeklyForecast`.

**UI-Plätze:**

**Stats-View dritter Tab „Cashflow":**
```
[ Übersicht ] [ Top-Kategorien ] [ Cashflow ]

Liniendiagramm (Recharts):
  - X-Achse: 13 Wochen (ISO-Datum)
  - Y-Achse: Fun-Konto-Balance
  - Horizontale Linien: 100€ (gelb gestrichelt), 0€ (rot gestrichelt)
  - Marker auf Wochen mit Subscription-Abbuchungen (kleine ↓-Symbole)
  
[Legende]
[Hinweis: „Basiert auf Median der letzten 3 Monate. Variiert mit deinem Verhalten."]
```

**Dashboard-Banner:**
- Bei Gelb (Fun < `cashflowFunWarnThreshold` in 30 Tagen): gelbe Card „Fun-Konto fällt voraussichtlich auf 85 € am 28.05.".
- Bei Rot (Fun < 0 in 30 Tagen): rote Card „⚠️ Fun-Konto droht negativ zu werden am 12.06.".
- Card hat Button „Details anzeigen" → öffnet Stats / Cashflow-Tab.

**Notification (#2f):** Triggert bei Rot, dedupliziert pro ISO-Woche.

**Akzeptanzkriterien:**

- [ ] Pure-Function-Tests für `forecastCashflow` mit synthetischen Daten:
  - Stabile Einnahmen + Subscriptions → monoton steigende Balance
  - Hohe Subscriptions in Woche 5 → Dip auf 50 € → Gelb-Warn aktiv
  - Keine Einnahmen → kontinuierlich fallend → Rot-Warn aktiv
- [ ] Chart rendert korrekt mit allen 13 Datenpunkten.
- [ ] Dashboard-Banner versteckt sich, wenn keine Warnung.
- [ ] Warn-Threshold konfigurierbar via `cashflowFunWarnThreshold`.

---

## Watchdog-Erweiterungen (konsolidiert)

`src/modules/watchdog/index.ts` `runStartupTasks()` wird um folgende Phasen ergänzt (in dieser Reihenfolge):

1. **Bestehend:** Ticker-Migrationen
2. **Bestehend:** Daily-News-Scan (mit 24h-Throttle)
3. **Bestehend:** Quarterly-Insight (am Quartals-Start)
4. **NEU (Batch 1):** `runRetentionCleanup()` — `csvImports` (30d) + `notificationLog` (90d) + ggf. `priceCache` cleanup.
5. **NEU (Batch 1):** `dispatchPendingNotifications()` — feuert alle aktiven Trigger.
6. **NEU (Batch 3):** `checkBackupDue()` — setzt Banner-Flag falls `lastBackup > 14d`.

Alle neuen Phasen sind idempotent und unter dem 24h-Throttle (`lastWatchdogRun`).

---

## Testing-Strategie

Konsistent mit CLAUDE.md Regel #4 (Tests nur für Pure Functions in `modules/` und `lib/`):

| Modul | Test-Datei | Coverage |
|---|---|---|
| `lib/debug.ts` | — | trivial, kein Test |
| `lib/hash.ts` (neu, falls separiert) | `lib/hash.test.ts` | Hash-Determinismus, Edge-Cases |
| `modules/anomaly/` | `modules/anomaly.test.ts` | Normalfall, dünne Historie, kleine Beträge |
| `modules/backtest/` | `modules/backtest.test.ts` | DCA-Simulation, Drawdown-Berechnung |
| `modules/backup/` | `modules/backup.test.ts` | Roundtrip, Filter (secrets ausgeschlossen) |
| `modules/forecast/` | `modules/forecast.test.ts` | Stabile/Fallende/Volatile Cashflows |
| `modules/notifications/` | `modules/notifications.test.ts` | `shouldFire()`-Logik pro Trigger |
| `modules/loans/` | `modules/loans.test.ts` | `buildReturnTransaction(loan)` |

UI-Tests bleiben außen vor (Akzeptanztests manuell auf iPhone 13).

---

## Risiken & Mitigationen

| Risiko | Mitigation |
|---|---|
| **IDB-Migration v1→v2** schlägt fehl für User-DB mit vielen Transaktionen | Hash-Berechnung asynchron im Upgrade-Handler in Batches à 100; UI zeigt Migration-Progress. Rollback via Schema-Version-Lock. |
| **iOS-Share-Sheet** registriert die PWA nicht | Akzeptanztest auf iPhone, ggf. Fallback in Settings „App neu installieren". |
| **Yahoo-History-Endpoint** liefert keine 10-Jahres-Daten für deutsche ETFs | Backtest degradiert auf max. verfügbaren Zeitraum, Disclaimer wird angepasst („Daten seit 2018"). |
| **Cashflow-Forecast** ist mathematisch unsauber bei seltenen Einnahmen | Median statt Mittelwert; bei <3 Monate Daten gibt Forecast ein Warn-Flag, das im UI angezeigt wird („Datenbasis dünn"). |
| **Notifications-Permission-Denied** auf iOS lässt sich nicht erneut anfragen | Settings zeigt klaren Hinweis „in iOS-Einstellungen → Notifications aktivieren". |

---

## Out-of-Scope (für Klarheit nochmals)

Folgende ursprünglichen Vorschläge sind **nicht** Teil dieses Spec:

- #1 Secrets-Verschlüsselung
- #8 Sparziel-Fortschrittsbalken
- #9 Subscription-Kostenprognose 12 Monate
- #10 What-If-Slider
- #12 Gig-Tracker
- #13 Steuer-Rücklagen-Konto
- #14 Lexware-Export
- #17 Monatlicher Markdown-Report
- #19 Service-Tests (Claude/Yahoo/Marketaux)
- #20 Result-Pattern-Refactor

Diese können in einem späteren Spec aufgegriffen werden.
