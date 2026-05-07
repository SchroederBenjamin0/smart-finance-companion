# Architektur-Spec

## Drei-Schichten-Modell (PWA-spezifisch)

```
┌─────────────────────────────────────────────────────────┐
│                    PRESENTATION                         │
│  React Components, Views, Zustand Stores               │
│  Tailwind + Radix UI                                   │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                    LOGIC (Pure Functions)               │
│  Module — testbar ohne DOM                              │
│  income-detector, categorizer, advisor, allocation,    │
│  watchdog                                               │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                    DATA                                 │
│  IndexedDB (idb library) — typisierte Wrappers         │
│  Repositories pro Entity                                │
│  Service-Layer für externe APIs                         │
│                                                         │
│  Service Worker (für Offline + Caching)                 │
└─────────────────────────────────────────────────────────┘
```

## Das "Check-on-Open"-Modell (PWA-Constraint)

Da iOS keine zuverlässigen Background-Tasks für PWAs erlaubt, bauen wir
folgendes Pattern: **Bei jedem App-Start prüft die App, was sie nachholen
muss.**

```typescript
// In App.tsx, on mount:
useEffect(() => {
  void runStartupTasks();
}, []);

async function runStartupTasks() {
  const lastCheck = await getLastWatchdogRun();
  const now = new Date();

  if (hoursSince(lastCheck) >= 24) {
    await runDailyTasks();    // Markt-Check, News, Subscription-Audit
  }

  if (isFirstOfMonth(now) && !hasMonthlyRecommendation(now)) {
    await generateMonthlyRecommendation();
  }

  if (isQuarterStart(now) && !hasQuarterlyInsight(now)) {
    void generateQuarterlyInsight(); // im Background, blockt UI nicht
  }
}
```

**Local Notifications für Erinnerungen**: Die App registriert zum
Onboarding-Zeitpunkt lokale Notifications, die das iPhone selbst auslöst:
- 1. des Monats, 19 Uhr: "Zeit für deinen Sparplan-Check"
- Letzter Tag eines Quartals, 18 Uhr: "Quartals-Insight wartet"

Diese Notifications werden via `Notification API` registriert. Sie funktionieren
auch wenn die App geschlossen ist, weil iOS sie selbst plant.

## Modul-Verantwortlichkeiten

### Income Detector (`src/modules/income-detector`)

**Zweck**: Eingehende Beträge klassifizieren und entscheiden, welcher
Workflow ausgelöst wird.

**Schwellwerte (in DB konfigurierbar)**:
- < 50 €: silent split, keine Notification
- 50-199 €: split + leise In-App-Notification
- 200-499 €: split + Vorschlag-Dialog
- 500-999 €: split + Vorschlag-Dialog + Push (lokal)
- ≥ 1000 €: special advisor task (einmaliger Sonderfall-Plan)

**Public API**:
```typescript
export type IncomeClassification =
  | { kind: 'silent'; allocation: Allocation }
  | { kind: 'standard'; allocation: Allocation }
  | { kind: 'review'; allocation: Allocation }
  | { kind: 'special'; amount: number; source: IncomeSource };

export function classify(
  amount: number,
  source: IncomeSource,
  thresholds: IncomeThresholds
): IncomeClassification;
```

### Categorizer (`src/modules/categorizer`)

**Zweck**: Transaktionen aus CSV-Imports kategorisieren.

**Drei-Stufen-Cascade**:
1. **Lookup**: IndexedDB-Store `categoryRules` mit exact/regex Patterns
2. **LLM-Batch**: Unbekannte → Claude-Batch-Call (max 30 pro Call)
3. **User-Review**: Confidence < 0.7 → Swipe-Through-UI, dann Lookup-Regel
   speichern (so lernt Stufe 1 dazu)

**Public API**:
```typescript
export async function categorizeTransactions(
  transactions: RawTransaction[]
): Promise<Result<CategorizedTransaction[], CategorizerError>>;

export async function applyUserCorrection(
  transactionId: string,
  newCategory: Category
): Promise<Result<void, DBError>>;
```

### Advisor (`src/modules/advisor`)

**Zweck**: ETF-Sparplan-Empfehlungen generieren.

**Drei Trigger** (alle synchron, beim App-Open ausgewertet):
- Monatlich am 1. (oder beim ersten App-Open im neuen Monat)
- Bei Income > 500 € (synchron mit Income Detector)
- Quartalsweise (Mar/Jun/Sep/Dec) für Insight-Report

**Public API**:
```typescript
export async function generateMonthlyRecommendation(
  availableEur: number,
  currentPortfolio: Portfolio,
  targetAllocation: AllocationTarget
): Promise<Result<Recommendation, AdvisorError>>;

export async function generateQuarterlyInsight(
  portfolio: Portfolio,
  ninetyDaysOfNews: NewsEvent[]
): Promise<Result<InsightReport, AdvisorError>>;
```

**Niemals tun**:
- Verkaufs-Empfehlungen aus News generieren
- Markt-Timing-Empfehlungen
- Krypto-Empfehlungen ohne explizite User-Frage
- Einzelaktien-Hot-Picks

### Allocation Engine (`src/modules/allocation`)

**Zweck**: Reine Regel-Engine ohne LLM. Verteilt einen Betrag auf drei Konten.

**Default-Regeln (User kann im Onboarding anpassen)**:
```typescript
const DEFAULT_MAIN_JOB_RULE: AllocationRule = {
  funPercentage: 30,
  savingsPercentage: 25,
  investmentPercentage: 45,
  savingsCap: 3300, // Notgroschen-Ziel
};

const DEFAULT_DJ_RULE: AllocationRule = {
  funPercentage: 20,
  savingsPercentage: 20,
  investmentPercentage: 60,
  savingsCap: 3300,
};
```

**Cap-Logik**: Wenn `currentSavings + savingsAllocation > savingsCap`,
fließt der Überschuss ins Investment-Konto.

**Public API** (synchron, keine async/await):
```typescript
export function split(
  amount: number,
  rule: AllocationRule,
  currentSavingsBalance: number
): Allocation;
```

### Watchdog (`src/modules/watchdog`)

**Zweck**: "Check-on-Open"-Tasks. Läuft bei jedem App-Start, prüft ob
Tasks fällig sind.

**Drei Tasks**:
1. **Markt-Check** (max 1x/Tag): Yahoo-Daten holen, Anomalien (>5% Tag,
   >15% Woche) erkennen — als In-App-Banner anzeigen, niemals als
   Aktions-Trigger
2. **News-Check** (max 1x/Tag): Marketaux abfragen, durch Claude Haiku
   filtern, materielle News als Banner zeigen
3. **Subscription-Audit** (max 1x/Woche): aus letztem CSV-Import neue
   wiederkehrende Buchungen erkennen

**Public API**:
```typescript
export async function runDailyTasks(): Promise<TaskResult[]>;
export async function runWeeklyTasks(): Promise<TaskResult[]>;
export async function shouldRunDaily(lastRun: Date): boolean;
export async function shouldRunWeekly(lastRun: Date): boolean;
```

## PWA-spezifische Architektur-Entscheidungen

### Storage-Eviction-Schutz

iOS kann IndexedDB-Daten nach 7+ Tagen Nicht-Nutzung löschen. Mitigations:

1. **Auto-Backup beim Schließen**: Service Worker schreibt bei jedem
   `beforeunload`-Event eine JSON-Backup-Datei via File System Access API
   (oder bei iOS-Limitierung: Download-Trigger für manuelles Speichern)
2. **Backup-Reminder**: Wenn App nach 5+ Tagen geöffnet wird, prüfe ob
   Daten vollständig sind, sonst Hinweis: "Letzter Backup war vor X Tagen.
   Jetzt sichern?"
3. **Persistent-Storage-Permission**: Bei App-Install via
   `navigator.storage.persist()` anfragen — verhindert Auto-Löschung

### Service Worker Strategy

Cache-Strategie:
- **App-Shell** (HTML, JS, CSS): Cache-First, Update-on-Network
- **API-Calls** (Claude, Yahoo, Marketaux): Network-First, kein Cache
- **Static Assets** (Icons, Manifest): Cache-First mit langem TTL

### Offline-Fähigkeit

Was offline funktioniert:
- ✅ Eingaben (DJ-Gigs, manuelle Transaktionen) — werden in IndexedDB
  gespeichert
- ✅ Anzeigen aller bestehenden Daten (Konten, Subscriptions, Portfolio)
- ✅ Allocation Engine (pure Logic)
- ❌ AI-Empfehlungen (brauchen Claude API)
- ❌ Marktdaten-Refresh (brauchen Yahoo)
- ❌ News-Check (braucht Marketaux)

Bei Offline-Status: UI zeigt Banner "Du bist offline. AI-Funktionen pausiert."

### Mobile-First Layout-Strategie

Wir designen für 390px (iPhone 13 Viewport).

- Bottom-Tab-Navigation mit 5 Tabs (siehe `specs/ui-flows.md`)
- Alle Inputs sind groß genug für Touch (min 44px Tap-Target)
- Keine Hover-Effekte (existieren auf Touch-Geräten nicht zuverlässig)
- Safe-Area-Insets respektieren (Notch, Home-Indicator)
- `viewport-fit=cover` im Meta-Tag für Edge-to-Edge-Layout

## Persistenz-Strategie

**Primary Store**: IndexedDB on-device

**Backup-Strategie**:
- **Manuell**: Settings → "Daten exportieren" → JSON-Download
- **Auto-Trigger**: Wöchentlich beim App-Open prompted die App
  ("Backup erstellen?")
- **Verschlüsselung**: AES-256 mit Web Crypto API, Schlüssel abgeleitet
  vom User-Passwort (Settings)
- **Speicherort**: Download-Ordner des Geräts (User entscheidet manuell wohin)

**Restore**:
- Settings → "Aus Backup wiederherstellen" → File-Picker → Verify Hash
  → Confirm Replace

## Performance-Constraints

- **App-Cold-Start**: < 2 Sekunden bis Dashboard sichtbar (nach erstem Load)
- **CSV-Import** von 500 Transaktionen: < 30 Sekunden inklusive Claude-Calls
- **Yahoo-Marktdaten-Refresh**: max alle 4 Stunden, gecacht in IndexedDB
- **Bundle-Size**: < 500 KB gzipped (kritisch für PWA-Install-Speed)
- **Lighthouse PWA Score**: 100 (mandatory)

## Logging und Telemetrie

**Nichts wird an externe Services geschickt.** Alle Logs lokal in IndexedDB
Store `appLog`. View in Settings: "Diagnose-Log anzeigen".

Log-Levels: `debug`, `info`, `warn`, `error`. Default: `info`.
Logs älter als 30 Tage werden automatisch gelöscht.

## Error-Handling-Pattern

Alle Service-Calls verwenden `Result<T, E>`:

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// Helper:
export const ok = <T>(value: T): Result<T, never> =>
  ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> =>
  ({ ok: false, error });
```

UI-Components dürfen keine `try/catch`-Blocks für Service-Calls haben. Das
Result-Pattern macht Errors zu erste-Klasse-Werten.

## State-Management mit Zustand

Ein Store pro Feature, nicht ein globaler. Beispiel:

```typescript
// stores/accounts.ts
interface AccountsStore {
  accounts: Account[];
  loadAccounts: () => Promise<void>;
  updateBalance: (type: AccountType, delta: number) => Promise<void>;
}

export const useAccountsStore = create<AccountsStore>((set, get) => ({
  accounts: [],
  loadAccounts: async () => {
    const result = await accountsRepo.findAll();
    if (result.ok) set({ accounts: result.value });
  },
  updateBalance: async (type, delta) => {
    // ... DB update + state refresh
  },
}));
```

Keine Verwendung von Redux, MobX oder ähnlichen Heavyweight-Lösungen.
