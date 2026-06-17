# Umbuchungs-Tracking & Daten-Löschen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beim Revolut-CSV-Import den echten Sparkonto-Saldo aus dem CSV-Header setzen, Umbuchungen zwischen Fun-/Sparkonto neutral (statt als Ausgabe/Einnahme) darstellen, und in den Einstellungen granulare Daten-Lösch-Funktionen anbieten.

**Architecture:** Der CSV-Parser liest zusätzlich die authoritativen „Closing balance"-Zeilen aus der Summary-Sektion (Vorrang vor dem bisherigen Letzte-Buchung-Heuristik, mit Fallback). Ein Helper `isInternalTransfer` steuert die neutrale UI-Darstellung an zwei Render-Stellen. Ein neues Repository `dataMaintenance` kapselt Object-Store-genaue Clear-Operationen, das Settings-UI ruft sie hinter Bestätigungsdialogen auf.

**Tech Stack:** React 18 + TypeScript (strict), Zustand, IndexedDB via `idb`, PapaParse, Vitest + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-06-09-umbuchung-tracking-und-daten-loeschen-design.md`

---

## File Structure

- `src/services/revolutCsvImport.ts` — **modify**: Summary-Closing-Balance-Parsing (Teil A1)
- `tests/services/revolutCsvImport.test.ts` — **modify**: neuer Test für Closing-Balance-Vorrang
- `src/modules/spending/index.ts` — **modify**: `isInternalTransfer`-Helper (Teil A2)
- `tests/modules/spending.test.ts` — **create**: Test für `isInternalTransfer` / `isNonSpending`
- `src/components/feature/imports/CsvImportSheet.tsx` — **modify**: neutrale Umbuchungs-Row (A2)
- `src/components/feature/dashboard/RecentList.tsx` — **modify**: neutrale Umbuchungs-Row (A2)
- `src/db/repositories/dataMaintenance.ts` — **create**: Clear-Funktionen (Teil B)
- `tests/db/dataMaintenance.test.ts` — **create**: fake-indexeddb-Test der Clear-Funktionen
- `src/views/Settings.tsx` — **modify**: Sektion „Daten löschen" + Confirm-Handler (Teil B)

---

## Task 1: CSV-Parser liest echte Schlussstände aus der Summary-Sektion

**Files:**
- Modify: `src/services/revolutCsvImport.ts`
- Test: `tests/services/revolutCsvImport.test.ts`

- [ ] **Step 1: Failing test schreiben**

In `tests/services/revolutCsvImport.test.ts` am Ende (vor der schließenden `});` des `describe`-Blocks) diese Fixture-Konstante auf Modulebene (nach `SAMPLE`) und den Test einfügen:

```ts
const SAMPLE_WITH_SUMMARY = `"Current Accounts Summaries",,,,,,,
,,,,,,,
"Personal Account (EUR)",,,,,,,
,,,,,,,
"Deposit value",,,,,,,
,,"Opening balance",€35.46,,,,
,,"Closing balance",€29.87,,,,
,,"Maximum balance","€1,416.44",,,,
,,,,,,,
"Savings Accounts Summaries",,,,,,,
,,,,,,,
"Savings  (EUR)",,,,,,,
,,,,,,,
"Deposit value",,,,,,,
,,"Opening balance",€14.92,,,,
,,"Closing balance",€375.33,,,,
,,,,,,,
"Current Accounts Transaction Statements",,,,,,,
,,,,,,,
"Personal Account (EUR)",,,,,,,
,,,,,,,
"Transaction statement",,,,,,,
Date,Description,Category,"Money in/out",Balance,"Tax withheld","Other taxes",Fees
"Apr 15, 2026","To Instant Access Savings",Others,-€200.00,€407.12,€0.00,€0.00,€0.00
"Jun 8, 2026","To Instant Access Savings",Others,-€1.00,€29.87,€0.00,€0.00,€0.00
,,,,,,,
"Savings Accounts Transaction Statements",,,,,,,
,,,,,,,
"Savings  (EUR)",,,,,,,
,,,,,,,
"Transaction statement (only interest receipt)",,,,,,,
Date,Description,"Gross rate","Gross interest","Taxes withheld","Other taxes",Fees,"Net interest"
4/3/26,"Net Interest Paid to 'Instant Access Savings' for Apr 3, 2026","2%",€0.01,€0.00,€0.00,€0.00,€0.01
`;
```

```ts
  it('prefers the summary "Closing balance" over the latest booking', async () => {
    const r = await parseRevolutCsv(fakeCsv(SAMPLE_WITH_SUMMARY));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The savings transaction section holds only interest rows (date format
    // "4/3/26" is skipped), so the ONLY savings balance source is the summary
    // header — previously this came back null.
    expect(r.value.finalBalances.savings).toBe(375.33);
    // Current closing balance is read from the summary header too.
    expect(r.value.finalBalances.current).toBe(29.87);
    // Only the two current-account bookings parse (interest rows are skipped).
    expect(r.value.transactions).toHaveLength(2);
  });
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/services/revolutCsvImport.test.ts`
Expected: FAIL — `finalBalances.savings` ist `null` (statt `375.33`), weil das Summary-Parsing noch fehlt.

- [ ] **Step 3: Summary-Closing-Balance-Parsing implementieren**

In `src/services/revolutCsvImport.ts`, innerhalb von `parseRevolutCsv`, direkt nach der Deklaration von `latest` (nach Zeile 87, `};`) diesen Akku ergänzen:

```ts
    // Authoritative bank-reported closing balance per account, read from the
    // summary section header (e.g. `,,"Closing balance",€375.33,,,,`). Takes
    // precedence over the last-booking heuristic below — critical for the
    // savings account, whose transaction section contains only interest rows
    // that never parse.
    const summaryClosing: Record<'current' | 'savings', number | null> = {
      current: null,
      savings: null,
    };
```

Dann im `for`-Loop, direkt **nach** dem Section-Header-Block (nach Zeile 96, `else if (/^Savings/i.test(first)) currentAccount = 'savings';`) und **vor** der `Date`-Header-Zeile (`if (first === 'Date' ...)`), diesen Block einfügen:

```ts
      if ((row[2] ?? '').trim() === 'Closing balance') {
        const cb = parseMoney(row[3] ?? '');
        if (cb !== null) summaryClosing[currentAccount] = cb;
        continue;
      }
```

Schließlich den `finalBalances`-Block im `return` (Zeilen 136-139) ersetzen durch:

```ts
      finalBalances: {
        current:
          summaryClosing.current ??
          (latest.current ? latest.current.balance : null),
        savings:
          summaryClosing.savings ??
          (latest.savings ? latest.savings.balance : null),
      },
```

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `npx vitest run tests/services/revolutCsvImport.test.ts`
Expected: PASS — neuer Test grün, alle bestehenden Tests (inkl. „extracts finalBalances per account from the latest booking" und „finalBalances are null when no rows exist") bleiben grün, weil die Fixtures dort keine „Closing balance"-Zeilen haben und damit der Fallback greift.

- [ ] **Step 5: Committen**

```bash
git add src/services/revolutCsvImport.ts tests/services/revolutCsvImport.test.ts
git commit -m "fix(csv): read authoritative closing balances from summary header

Savings closing balance now comes from the CSV summary (e.g. €375.33)
instead of being null, so the Sparkonto balance is set on import.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `isInternalTransfer`-Helper

**Files:**
- Modify: `src/modules/spending/index.ts`
- Test: `tests/modules/spending.test.ts` (create)

- [ ] **Step 1: Failing test schreiben**

Datei `tests/modules/spending.test.ts` neu anlegen:

```ts
import { describe, it, expect } from 'vitest';
import { isInternalTransfer, isNonSpending } from '@/modules/spending';

describe('isInternalTransfer', () => {
  it('is true only for umbuchung', () => {
    expect(isInternalTransfer('umbuchung')).toBe(true);
    expect(isInternalTransfer('transfer')).toBe(false);
    expect(isInternalTransfer('lebensmittel')).toBe(false);
  });

  it('umbuchung counts as non-spending, transfer does not', () => {
    expect(isNonSpending('umbuchung')).toBe(true);
    expect(isNonSpending('transfer')).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/modules/spending.test.ts`
Expected: FAIL — `isInternalTransfer` ist nicht exportiert (Import-Fehler).

- [ ] **Step 3: Helper implementieren**

In `src/modules/spending/index.ts` direkt nach der `isNonSpending`-Funktion (nach Zeile 17) ergänzen:

```ts
/**
 * True for moves between the user's OWN accounts (umbuchung). These are
 * neither spending nor income and must render neutrally in the UI — no red
 * "expense" / green "income" styling. `transfer` (payments to third parties)
 * is NOT internal and stays a real expense.
 */
export function isInternalTransfer(category: string): boolean {
  return category === 'umbuchung';
}
```

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `npx vitest run tests/modules/spending.test.ts`
Expected: PASS

- [ ] **Step 5: Committen**

```bash
git add src/modules/spending/index.ts tests/modules/spending.test.ts
git commit -m "feat(spending): add isInternalTransfer helper for umbuchung UI

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Umbuchungen in der CSV-Import-Vorschau neutral darstellen

**Files:**
- Modify: `src/components/feature/imports/CsvImportSheet.tsx`

(UI-Änderung — keine Unit-Tests, Verifikation via Typecheck.)

- [ ] **Step 1: Imports ergänzen**

In `src/components/feature/imports/CsvImportSheet.tsx`:

Im lucide-Import-Block (Zeilen 2-8) `ArrowLeftRight` ergänzen, sodass der Block lautet:

```ts
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
} from 'lucide-react';
```

Und nach den bestehenden Imports (nach Zeile 30, `import { AnomalyBanner } ...`) ergänzen:

```ts
import { isInternalTransfer } from '@/modules/spending';
```

- [ ] **Step 2: ReviewRow-Betragsdarstellung umbauen**

In der `ReviewRow`-Funktion (ab Zeile 348) die Zeile `const isExpense = draft.txn.amount < 0;` (Zeile 355) ersetzen durch:

```ts
  const isExpense = draft.txn.amount < 0;
  const isTransfer = isInternalTransfer(draft.category);
```

Den Betrags-Block (Zeilen 377-384) ersetzen:

```tsx
            {isTransfer ? (
              <div className="inline-flex shrink-0 items-center gap-1 text-[14px] font-semibold tabular-nums text-ink-muted">
                <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                {formatEur(Math.abs(draft.txn.amount))}
              </div>
            ) : (
              <div
                className={`shrink-0 text-[14px] font-semibold tabular-nums ${
                  isExpense
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {isExpense ? '−' : '+'}
                {formatEur(Math.abs(draft.txn.amount))}
              </div>
            )}
```

- [ ] **Step 3: Typecheck laufen lassen**

Run: `npm run lint`
Expected: PASS (keine TS-Fehler). Hinweis: `isExpense` wird weiterhin im `else`-Zweig verwendet, ist also nicht unbenutzt.

- [ ] **Step 4: Committen**

```bash
git add src/components/feature/imports/CsvImportSheet.tsx
git commit -m "feat(csv): render umbuchung rows neutrally in import review

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Umbuchungen in der Dashboard-Liste neutral darstellen

**Files:**
- Modify: `src/components/feature/dashboard/RecentList.tsx`

(UI-Änderung — keine Unit-Tests, Verifikation via Typecheck.)

- [ ] **Step 1: Imports ergänzen**

In `src/components/feature/dashboard/RecentList.tsx`:

Den lucide-Import (Zeilen 1-5) erweitern:

```ts
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react';
```

Nach dem `formatEur`-Import (Zeile 7) ergänzen:

```ts
import { isInternalTransfer } from '@/modules/spending';
```

- [ ] **Step 2: Expense-Branch in `RecentList` umbauen**

Den Expense-Branch (Zeilen 53-69, beginnend mit dem Kommentar `// Sign of the persisted transaction amount ...`) ersetzen durch:

```tsx
        // Sign of the persisted transaction amount decides direction — a
        // Revolut top-up is stored positive and renders incoming/emerald.
        // Umbuchungen (own-account moves) render neutral: no red/green.
        const tx = it.transaction;
        const isTransfer = isInternalTransfer(tx.category);
        const isIncoming = tx.amount >= 0;
        return (
          <RecentRow
            key={`t-${tx.id}`}
            icon={
              isTransfer
                ? ArrowLeftRight
                : isIncoming
                  ? ArrowUpRight
                  : ArrowDownLeft
            }
            title={tx.counterparty}
            subtitle={tx.category}
            amount={tx.amount}
            when={formatRelativeDate(tx.date)}
            positive={isIncoming}
            neutral={isTransfer}
            index={i}
            onClick={onSelect ? () => onSelect(it) : undefined}
          />
        );
```

- [ ] **Step 3: `RecentRow` um `neutral`-Prop erweitern**

Das `RowProps`-Interface (Zeilen 75-84) um `neutral` ergänzen:

```ts
interface RowProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  amount: number;
  when: string;
  positive: boolean;
  neutral?: boolean;
  index: number;
  onClick?: () => void;
}
```

Die `RecentRow`-Signatur (Zeilen 86-95) um `neutral = false` ergänzen:

```tsx
function RecentRow({
  icon: Icon,
  title,
  subtitle,
  amount,
  when,
  positive,
  neutral = false,
  index,
  onClick,
}: RowProps) {
```

Im `RecentRow`-Body, direkt nach `const Element = ...` (Zeile 96), die Tone-Klassen berechnen:

```tsx
  const bubbleClass = neutral
    ? 'bg-paper text-ink-muted'
    : positive
      ? 'bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200'
      : 'bg-red-50 text-red-600';
  const amountClass = neutral
    ? 'text-ink-muted'
    : positive
      ? 'text-emerald-700 dark:text-emerald-400'
      : 'text-ink';
  const prefix = neutral ? '' : positive ? '+' : '';
  const shownAmount = neutral ? Math.abs(amount) : amount;
```

Den Icon-Bubble-`div` (Zeilen 104-110) ersetzen:

```tsx
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${bubbleClass}`}
      >
        <Icon className="h-4 w-4" strokeWidth={2.5} />
      </div>
```

Den Betrags-`div` (Zeilen 120-127) ersetzen:

```tsx
        <div
          className={`text-[15px] font-semibold tabular-nums ${amountClass}`}
        >
          {prefix}
          {formatEur(shownAmount)}
        </div>
```

- [ ] **Step 4: Typecheck laufen lassen**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 5: Committen**

```bash
git add src/components/feature/dashboard/RecentList.tsx
git commit -m "feat(dashboard): render umbuchung neutrally in recent list

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `dataMaintenance`-Repository mit Clear-Funktionen

**Files:**
- Create: `src/db/repositories/dataMaintenance.ts`
- Test: `tests/db/dataMaintenance.test.ts`

- [ ] **Step 1: Failing test schreiben**

Datei `tests/db/dataMaintenance.test.ts` neu anlegen:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getDB, resetDB } from '@/db/client';
import { dataMaintenanceRepo } from '@/db/repositories/dataMaintenance';
import type { Account, SecretEntry, Subscription, Transaction } from '@/db/types';
import { nowIso } from '@/lib/date';

beforeEach(async () => {
  await resetDB();
});

async function seed(): Promise<void> {
  const db = await getDB();
  const ts = nowIso();

  const account: Account = {
    id: 'acc-savings',
    type: 'savings',
    balance: 375.33,
    goalAmount: null,
    lastUpdated: ts,
  };
  await db.put('accounts', account);

  const sub: Subscription = {
    id: 'sub-1',
    name: 'Splice',
    amount: 9.99,
    currency: 'USD',
    billingCycle: 'monthly',
    nextBillDate: '2026-07-01',
    endDate: null,
    category: 'musik-tools',
    isActive: 1,
  };
  await db.put('subscriptions', sub);

  const txn: Transaction = {
    id: 'txn-1',
    date: '2026-04-03',
    amount: -18.88,
    counterparty: 'EDEKA',
    description: null,
    category: 'lebensmittel',
    categoryConfidence: 0.95,
    isUserReviewed: 1,
    sourceCsvId: 'csv-1',
    importedAt: ts,
    transactionHash: 'hash-1',
    isAnomaly: 0,
  };
  await db.put('transactions', txn);

  const secret: SecretEntry = {
    key: 'anthropic_key',
    encryptedValue: 'enc',
    iv: 'iv',
    createdAt: ts,
  };
  await db.put('secrets', secret);

  await db.put('appConfig', {
    key: 'allocation_rules',
    value: '{}',
    updatedAt: ts,
  });
}

describe('dataMaintenanceRepo.clearSubscriptions', () => {
  it('clears only subscriptions', async () => {
    await seed();
    const r = await dataMaintenanceRepo.clearSubscriptions();
    expect(r.ok).toBe(true);
    const db = await getDB();
    expect(await db.count('subscriptions')).toBe(0);
    expect(await db.count('transactions')).toBe(1);
  });
});

describe('dataMaintenanceRepo.clearRevolutData', () => {
  it('clears transactions and csvImports, keeps subscriptions', async () => {
    await seed();
    const r = await dataMaintenanceRepo.clearRevolutData();
    expect(r.ok).toBe(true);
    const db = await getDB();
    expect(await db.count('transactions')).toBe(0);
    expect(await db.count('csvImports')).toBe(0);
    expect(await db.count('subscriptions')).toBe(1);
  });
});

describe('dataMaintenanceRepo.clearAllFinancialData', () => {
  it('clears financial stores and zeroes balances but keeps secrets + settings', async () => {
    await seed();
    const r = await dataMaintenanceRepo.clearAllFinancialData();
    expect(r.ok).toBe(true);

    const db = await getDB();
    expect(await db.count('subscriptions')).toBe(0);
    expect(await db.count('transactions')).toBe(0);

    const accounts = await db.getAll('accounts');
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.balance).toBe(0);

    // API key and user settings survive a financial-data wipe.
    expect(await db.count('secrets')).toBe(1);
    expect(await db.count('appConfig')).toBe(1);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/db/dataMaintenance.test.ts`
Expected: FAIL — Modul `@/db/repositories/dataMaintenance` existiert nicht.

- [ ] **Step 3: Repository implementieren**

Datei `src/db/repositories/dataMaintenance.ts` neu anlegen:

```ts
import type { StoreNames } from 'idb';
import { getDB } from '../client';
import { tryAsync, type Result } from '@/lib/result';
import { nowIso } from '@/lib/date';
import { configRepo } from './config';
import { ALL_CONFIG_KEYS } from '../types';
import type { SmartFinanceDB } from '../schema';

type FinanceStore = StoreNames<SmartFinanceDB>;

async function clearStores(stores: FinanceStore[]): Promise<void> {
  const db = await getDB();
  await Promise.all(stores.map((s) => db.clear(s)));
}

/** Reset every account balance to 0 without deleting the account rows —
 *  the app relies on the fun/savings/(investment) rows always existing. */
async function resetAccountBalances(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('accounts', 'readwrite');
  const all = await tx.store.getAll();
  const ts = nowIso();
  await Promise.all([
    ...all.map((a) => tx.store.put({ ...a, balance: 0, lastUpdated: ts })),
    tx.done,
  ]);
}

export const dataMaintenanceRepo = {
  /** Delete all subscriptions only. */
  clearSubscriptions(): Promise<Result<void>> {
    return tryAsync(() => clearStores(['subscriptions']));
  },

  /** Delete all transactions (incl. manual) + CSV import records. Balances
   *  are intentionally left untouched (editable under "Konten-Salden"). */
  clearRevolutData(): Promise<Result<void>> {
    return tryAsync(() => clearStores(['transactions', 'csvImports']));
  },

  /** Delete Trade-Republic positions plus their derived price/news caches.
   *  Advisor history (recommendations/newsEvents) is preserved. */
  clearInvestmentPositions(): Promise<Result<void>> {
    return tryAsync(() =>
      clearStores(['investmentPositions', 'priceCache', 'newsCache']),
    );
  },

  /** Wipe ALL financial data and zero balances. Keeps API key (secrets),
   *  PIN, onboarding flag, allocation/category rules and other settings. */
  clearAllFinancialData(): Promise<Result<void>> {
    return tryAsync(async () => {
      await clearStores([
        'incomeEntries',
        'allocations',
        'subscriptions',
        'transactions',
        'csvImports',
        'investmentPositions',
        'loans',
        'recommendations',
        'newsEvents',
        'priceCache',
        'newsCache',
      ]);
      await resetAccountBalances();
      await configRepo.remove(ALL_CONFIG_KEYS.legacyInvestmentBalance);
      await configRepo.remove(ALL_CONFIG_KEYS.legacyInvestmentBannerDismissed);
    });
  },
};
```

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `npx vitest run tests/db/dataMaintenance.test.ts`
Expected: PASS (alle drei `describe`-Blöcke grün).

- [ ] **Step 5: Committen**

```bash
git add src/db/repositories/dataMaintenance.ts tests/db/dataMaintenance.test.ts
git commit -m "feat(db): add dataMaintenance repo for granular data deletion

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Settings-Sektion „Daten löschen"

**Files:**
- Modify: `src/views/Settings.tsx`

(UI-Verdrahtung — keine Unit-Tests, Verifikation via Typecheck.)

- [ ] **Step 1: Imports ergänzen**

In `src/views/Settings.tsx` im lucide-Import-Block (Zeilen 2-18) `Repeat` und `Trash2` ergänzen (alphabetisch passend einsortieren), z.B.:

```ts
  RefreshCw,
  Repeat,
  Shield,
  Tag,
  Trash2,
  Wallet,
```

Nach dem `resetDB`-Import (Zeile 27) ergänzen:

```ts
import { dataMaintenanceRepo } from '@/db/repositories/dataMaintenance';
```

- [ ] **Step 2: Confirm-Handler hinzufügen**

In der `Settings`-Komponente, direkt nach der `resetApp`-Funktion (nach Zeile 107, der schließenden `}`), diese vier Handler einfügen:

```ts
  async function handleClearSubscriptions() {
    if (
      !window.confirm(
        'Alle Abos löschen? Deine Subscription-Liste wird entfernt. Andere Daten bleiben erhalten.',
      )
    )
      return;
    const r = await dataMaintenanceRepo.clearSubscriptions();
    if (!r.ok) {
      pushToast(`Fehler: ${r.error.message}`, 'error');
      return;
    }
    pushToast('Abos gelöscht ✓', 'success');
  }

  async function handleClearRevolut() {
    if (
      !window.confirm(
        'Alle Transaktionen und CSV-Importe löschen? Die Konten-Salden bleiben unverändert (anpassbar oben unter „Konten-Salden").',
      )
    )
      return;
    const r = await dataMaintenanceRepo.clearRevolutData();
    if (!r.ok) {
      pushToast(`Fehler: ${r.error.message}`, 'error');
      return;
    }
    pushToast('Revolut-Daten gelöscht ✓', 'success');
  }

  async function handleClearPositions() {
    if (
      !window.confirm(
        'Alle Trade-Republic-Positionen löschen? Kurs- und News-Cache werden ebenfalls geleert.',
      )
    )
      return;
    const r = await dataMaintenanceRepo.clearInvestmentPositions();
    if (!r.ok) {
      pushToast(`Fehler: ${r.error.message}`, 'error');
      return;
    }
    pushToast('Positionen gelöscht ✓', 'success');
  }

  async function handleClearAll() {
    if (
      !window.confirm(
        'ALLE Finanzdaten löschen? Transaktionen, Abos, Positionen, Einnahmen und Salden werden entfernt. API-Key, PIN und Einstellungen bleiben erhalten.',
      )
    )
      return;
    const r = await dataMaintenanceRepo.clearAllFinancialData();
    if (!r.ok) {
      pushToast(`Fehler: ${r.error.message}`, 'error');
      return;
    }
    await reloadAccounts();
    pushToast('Alle Finanzdaten gelöscht ✓', 'success');
  }
```

- [ ] **Step 3: Sektion „Daten löschen" ins JSX einfügen**

In `src/views/Settings.tsx` direkt **vor** der bestehenden `<Section title="Daten">` (Zeile 282) diese neue Sektion einfügen:

```tsx
        <Section title="Daten löschen">
          <Row
            Icon={Repeat}
            label="Nur Abos löschen"
            value=""
            destructive
            onClick={() => void handleClearSubscriptions()}
          />
          <Row
            Icon={FileJson}
            label="Nur Revolut-CSV löschen"
            value=""
            destructive
            onClick={() => void handleClearRevolut()}
          />
          <Row
            Icon={Database}
            label="Nur Trade-Republic-Positionen löschen"
            value=""
            destructive
            onClick={() => void handleClearPositions()}
          />
          <Row
            Icon={Trash2}
            label="Alle Finanzdaten löschen"
            value=""
            destructive
            onClick={() => void handleClearAll()}
          />
        </Section>
```

- [ ] **Step 4: Typecheck laufen lassen**

Run: `npm run lint`
Expected: PASS (`Repeat`, `Trash2`, `dataMaintenanceRepo` werden alle verwendet; `reloadAccounts` ist bereits in der Komponente definiert).

- [ ] **Step 5: Vollständige Testsuite + Build**

Run: `npm test`
Expected: PASS (alle Tests grün).

Run: `npm run build`
Expected: Build erfolgreich (tsc + vite).

- [ ] **Step 6: Committen**

```bash
git add src/views/Settings.tsx
git commit -m "feat(settings): add granular + full data-deletion controls

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- A1 (Sparkonto-Saldo aus CSV-Header) → Task 1 ✓
- A2 (`isInternalTransfer` + neutrale Darstellung) → Task 2 (Helper), Task 3 (Import-Vorschau), Task 4 (Dashboard-Liste) ✓
- B (vier Lösch-Aktionen) → Task 5 (Repo), Task 6 (Settings-UI) ✓
- Tests: Parser-Test (Task 1), `isInternalTransfer`-Test (Task 2), Repo-Test (Task 5) ✓

**Type consistency:**
- `isInternalTransfer(category: string): boolean` — identisch verwendet in Tasks 2/3/4.
- `dataMaintenanceRepo.{clearSubscriptions,clearRevolutData,clearInvestmentPositions,clearAllFinancialData}` — identische Namen in Tasks 5/6.
- `finalBalances: { current: number | null; savings: number | null }` — Shape unverändert, nur Befüllung erweitert.
- `RowProps.neutral?: boolean` — neu, in Task 4 definiert und genutzt.

**Manuelle Verifikation (nach Task 6, optional im echten App-Flow):**
1. Echte Revolut-CSV importieren → Sparkonto-Saldo zeigt ~375,33 € statt ~500 €.
2. „To/From Instant Access Savings" erscheinen in Import-Vorschau & Dashboard-Liste neutral (⇄, kein Rot/Grün).
3. Einstellungen → „Daten löschen": jede der vier Aktionen fragt nach und löscht den korrekten Umfang.
