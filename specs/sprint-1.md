# Sprint 1: Foundation (Wochen 1-2)

## Ziel

Eine PWA, die auf dem iPhone installiert werden kann, einen Onboarding-Flow
hat, manuelle Income-Eingaben akzeptiert und korrekt aufteilt, und auf
GitHub Pages deployed ist.

## Definition of Done

✅ App ist auf iPhone 13 als PWA installierbar (Add to Home Screen
funktioniert)
✅ Beim ersten Start läuft Onboarding-Flow durch alle 6 Schritte
✅ User kann eine Einnahme erfassen, sieht korrekte 3-Konten-Aufteilung
✅ Daten persistieren (App schließen → neu öffnen → alles noch da)
✅ Lighthouse PWA Score: 100
✅ Bundle Size: < 500 KB gzipped
✅ App auf GitHub Pages live unter
   `https://username.github.io/smart-finance-companion`
✅ Vitest-Tests für Allocation Engine grün

## Tasks (in Reihenfolge)

### Task 1.1: Projekt-Setup

```bash
npm create vite@latest smart-finance-companion -- --template react-ts
cd smart-finance-companion
npm install
```

Dependencies:
```bash
npm install zustand idb papaparse uuid
npm install @radix-ui/react-dialog @radix-ui/react-select \
            @radix-ui/react-slider @radix-ui/react-switch
npm install recharts
npm install -D tailwindcss postcss autoprefixer @types/papaparse \
              @types/uuid vite-plugin-pwa
npx tailwindcss init -p
```

Config-Files:
- `tailwind.config.ts`: Mobile-First, Dark-Mode `class`, Content paths
- `vite.config.ts`: PWA Plugin mit Manifest, Service Worker
- `tsconfig.json`: strict mode, `paths` für `@/*` aliases

### Task 1.2: Result-Pattern Helper

`src/lib/result.ts`:

```typescript
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> =>
  ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> =>
  ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } =>
  r.ok;

export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } =>
  !r.ok;

// Helper for async-await-style usage
export async function tryAsync<T>(
  fn: () => Promise<T>
): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
```

Test: `tests/lib/result.test.ts` mit ~5 Test-Cases.

### Task 1.3: IndexedDB Setup

`src/db/schema.ts` und `src/db/client.ts` nach Spec aus `datenmodell.md`.

Repositories vorerst nur:
- `src/db/repositories/accounts.ts`
- `src/db/repositories/income.ts`
- `src/db/repositories/allocations.ts`
- `src/db/repositories/config.ts`
- `src/db/repositories/secrets.ts`

### Task 1.4: Allocation Engine

`src/modules/allocation/index.ts`:

```typescript
import { Allocation, AllocationRule, AccountType } from '@/db/types';
import { generateId } from '@/lib/id';

export interface AllocationResult {
  fun: number;
  savings: number;
  investment: number;
  capApplied: boolean;
}

export function split(
  amount: number,
  rule: AllocationRule,
  currentSavingsBalance: number
): AllocationResult {
  let savings = round2(amount * rule.savingsPercentage / 100);
  let investment = round2(amount * rule.investmentPercentage / 100);
  const fun = round2(amount * rule.funPercentage / 100);

  let capApplied = false;
  if (rule.savingsCap !== null) {
    const newSavings = currentSavingsBalance + savings;
    if (newSavings > rule.savingsCap) {
      const overflow = newSavings - rule.savingsCap;
      savings -= overflow;
      investment += overflow;
      capApplied = true;
    }
  }

  return {
    fun,
    savings: round2(savings),
    investment: round2(investment),
    capApplied,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
```

Tests: `tests/modules/allocation.test.ts`:
- Test: Standard-Split 100€, 30/25/45 → 30/25/45
- Test: Cap-Logic: Sparkonto 3200, +200 mit Cap 3300 → +100 statt +200
- Test: Cap-Logic: Sparkonto 3300, +100 → 0 in Sparkonto, +100 ins Investment
- Test: Rounding: 33,33€ split bei 30/30/40 → korrekte Summe

### Task 1.5: Income Detector

`src/modules/income-detector/index.ts`:

```typescript
import {
  IncomeClassification, IncomeSource, IncomeThresholds
} from '@/db/types';

export function classify(
  amount: number,
  source: IncomeSource,
  thresholds: IncomeThresholds
): IncomeClassification {
  if (amount < thresholds.silent) return 'silent';
  if (amount < thresholds.standard) return 'standard';
  if (amount < thresholds.review) return 'review';
  if (amount < thresholds.special) return 'review';
  return 'special';
}
```

Tests: 4 Edge-Cases (49.99, 50, 199, 200, 499, 500, 999, 1000, 1500).

### Task 1.6: Onboarding-Flow

Components in `src/components/feature/onboarding/`:
- `OnboardingShell.tsx` (Stepper-Container)
- `WelcomeStep.tsx`
- `ApiKeysStep.tsx`
- `RulesStep.tsx`
- `EmergencyFundStep.tsx`
- `SubscriptionsStep.tsx`
- `ActivationStep.tsx`

State: lokal in `OnboardingShell`, am Ende ein einziger DB-Write.

API-Keys-Validierung: Echter Probe-Call zu Anthropic API, bevor "Weiter"
aktiv wird.

### Task 1.7: Dashboard-View

`src/views/Dashboard.tsx`:
- Lädt Accounts via Repository
- Zeigt 3 Cards (Fun, Savings, Investment)
- Sparkonto: Progress-Bar zum Notgroschen-Ziel
- Investment: zunächst nur Saldo (Performance kommt in Sprint 3)
- Pull-to-Refresh: vorerst No-Op (echter Refresh ab Sprint 4)

### Task 1.8: Income-Eingabe-View

`src/views/Income.tsx`:
- Form mit allen Feldern aus `ui-flows.md` Tab 2
- Live-Preview der Aufteilung (während User tippt)
- "Erfassen"-Button: schreibt Income + 3 Allocations + updated Account-Balances
  in einer DB-Transaction
- Toast-Notification bei Erfolg

### Task 1.9: Bottom-Tab-Navigation

`src/components/layout/BottomNav.tsx`:
- 5 Tabs (Home, Add, Subs, Inv, Settings) — Subs/Inv vorerst Placeholder
- Aktiver Tab gehighlighted
- Safe-Area-Inset-Bottom respektieren

### Task 1.10: PWA-Manifest und Service Worker

`public/manifest.json`:
```json
{
  "name": "Smart Finance Companion",
  "short_name": "Finance",
  "start_url": "/smart-finance-companion/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1e40af",
  "orientation": "portrait",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Service Worker via `vite-plugin-pwa`:
- precache aller statischen Assets
- runtime-cache für Fonts
- offline-fallback für API-Calls

### Task 1.11: GitHub Pages Deployment

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

`vite.config.ts`:
```typescript
export default defineConfig({
  base: '/smart-finance-companion/',
  // ...
});
```

In GitHub: Repo Settings → Pages → Source: "GitHub Actions"

### Task 1.12: Erste Installation testen

User-Schritte:
1. URL in Safari auf iPhone öffnen
2. Share → "Zum Home-Bildschirm"
3. App-Icon vom Home-Screen öffnen
4. Onboarding durchlaufen
5. Test-Einnahme erfassen
6. App schließen, neu öffnen, prüfen ob Daten da sind

## Out of Scope (kommt in späteren Sprints)

- ❌ Subscription-Tracker (Sprint 2)
- ❌ CSV-Import und Categorizer (Sprint 2)
- ❌ Investment-Tracking mit Yahoo (Sprint 3)
- ❌ AI-Empfehlungen (Sprint 4)
- ❌ News-Filter (Sprint 4)
- ❌ Push-Notifications (Sprint 4)

## Erwartete Probleme und Lösungen

**Problem**: iOS löscht IndexedDB nach 7 Tagen Nicht-Nutzung.
**Lösung**: `navigator.storage.persist()` beim ersten Start anfragen.

**Problem**: Service Worker registriert sich nicht.
**Lösung**: HTTPS ist Pflicht. GitHub Pages liefert HTTPS automatisch.
Lokales Testen: nur via `localhost`, nicht via IP.

**Problem**: Add-to-Home-Screen funktioniert nicht.
**Lösung**: Manifest muss valide sein, alle Icons präsent, `display: standalone`.

**Problem**: Anthropic-API-Call schlägt mit CORS-Fehler fehl.
**Lösung**: Anthropic API hat CORS aktiviert, aber prüfen mit
`anthropic-version` Header. Fallback: Cloudflare Worker als Proxy
(siehe `specs/api-integrationen.md`).
