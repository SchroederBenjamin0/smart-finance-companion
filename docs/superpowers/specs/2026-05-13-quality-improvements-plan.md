# Smart Finance Companion — Quality Improvements Plan

> Implementation plan for the four quick-win improvements after Batch 3 merge.

**Goal:** Close two known-gaps from Batch 3 + add two high-value features:
1. Cashflow-Warn-Threshold slider in Settings (known gap)
2. Recharts dark-mode (known gap)
3. Smart Categorization Memory (rule suggestion after manual re-categorize)
4. Manual Transaction Edit (counterparty / category / date / description)

**Architecture:** Pure helpers where logical, side-effect adapters in components. No DB schema changes — all writes go through existing repos. Transaction edit only allows "annotation" fields (counterparty / category / date / description) — amount and account changes are out of scope (require balance-adjustment dance).

**Tech Stack:** Same as before (TypeScript strict, IndexedDB via `idb`, Radix UI, Tailwind dark mode via CSS vars).

---

## File Structure

### Neue Dateien (5)

| Datei | Zweck |
|---|---|
| `src/components/feature/settings/CashflowThresholdSlider.tsx` | Slider for Fun-Konto warning level |
| `src/lib/chart-colors.ts` | `useChartColors()` hook reading CSS vars at render-time |
| `src/modules/categorization-memory/index.ts` | Pure: `suggestRuleFromChange(originalCategory, newCategory, counterparty)` |
| `src/components/feature/categorization/RuleSuggestionPrompt.tsx` | Toast-like prompt asking to persist a rule |
| `tests/modules/categorization-memory.test.ts` | Pure-function tests |

### Geänderte Dateien (~8)

| Datei | Änderung |
|---|---|
| `src/views/Settings.tsx` | Insert CashflowThresholdSlider in Investments section |
| `src/components/feature/stats/CashflowTab.tsx` | Use `useChartColors` for stroke colors |
| `src/components/feature/advisor/BacktestPanel.tsx` | Use `useChartColors` for stroke colors |
| `src/db/repositories/transactions.ts` | Add `updateAnnotation(id, patch)` method |
| `src/components/feature/dashboard/EntryDetailsSheet.tsx` | Add edit-mode toggle + form |
| `src/components/feature/stats/CategoryDrilldownSheet.tsx` | After LLM-recheck, surface rule suggestions |
| `src/components/feature/imports/CsvImportSheet.tsx` | After review-stage manual changes, surface rule suggestions |

---

## Task 1: Cashflow-Threshold Slider

**Files:**
- Create: `src/components/feature/settings/CashflowThresholdSlider.tsx`
- Modify: `src/views/Settings.tsx`

- [ ] **Step 1.1: Implement slider**

```tsx
import { useEffect, useState } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { configRepo } from '@/db/repositories/config';
import { ALL_CONFIG_KEYS } from '@/db/types';

const PRESETS = [50, 100, 200, 300, 500];

export function CashflowThresholdSlider() {
  const [value, setValue] = useState(100);

  useEffect(() => {
    void (async () => {
      const r = await configRepo.getRaw(ALL_CONFIG_KEYS.cashflowFunWarnThreshold);
      if (r.ok && r.value) setValue(clamp(Number(r.value), 50, 500));
    })();
  }, []);

  const handleChange = (vals: number[]) => {
    const v = vals[0] ?? 100;
    setValue(v);
    void configRepo.setRaw(ALL_CONFIG_KEYS.cashflowFunWarnThreshold, String(v));
  };

  const snapToPreset = (preset: number) => {
    setValue(preset);
    void configRepo.setRaw(ALL_CONFIG_KEYS.cashflowFunWarnThreshold, String(preset));
  };

  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <label className="text-[14px] font-medium text-ink">Cashflow-Warnschwelle</label>
        <span className="text-[14px] tabular-nums text-ink-muted">{value} €</span>
      </div>
      <Slider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        value={[value]}
        onValueChange={handleChange}
        min={50} max={500} step={10}
      >
        <Slider.Track className="relative h-1.5 grow rounded-full bg-divider">
          <Slider.Range className="absolute h-full rounded-full bg-forest-700" />
        </Slider.Track>
        <Slider.Thumb className="block h-5 w-5 rounded-full border-2 border-forest-700 bg-surface shadow" />
      </Slider.Root>
      <div className="mt-2 flex gap-1">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => snapToPreset(p)}
            className={`flex-1 rounded-full px-2 py-1 text-[11px] transition ${
              value === p ? 'bg-forest-700 text-white' : 'bg-paper text-ink-muted'
            }`}
          >
            {p} €
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-subtle">
        Gelbe Warnung erscheint, wenn das Fun-Konto in den nächsten 30 Tagen unter diesen Wert fällt.
      </p>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
```

- [ ] **Step 1.2: Inject in Settings.tsx**

Read `src/views/Settings.tsx`. Find the existing Investments section (containing DriftToleranceSlider). Add the CashflowThresholdSlider in the same card, separated by a divider:

```tsx
import { CashflowThresholdSlider } from '@/components/feature/settings/CashflowThresholdSlider';

// Inside the Investments section card:
<DriftToleranceSlider />
<div className="border-t border-divider" />
<CashflowThresholdSlider />
```

- [ ] **Step 1.3: TS + commit**

```
cd "/Users/benji/Desktop/Apps/Persönliche Budgeting App" && npx tsc -p tsconfig.app.json --noEmit
git add src/components/feature/settings/CashflowThresholdSlider.tsx src/views/Settings.tsx
git commit -m "feat(settings): cashflow warn-threshold slider"
```

---

## Task 2: Recharts Dark-Mode Hook

**Files:**
- Create: `src/lib/chart-colors.ts`
- Modify: `src/components/feature/stats/CashflowTab.tsx`
- Modify: `src/components/feature/advisor/BacktestPanel.tsx`

- [ ] **Step 2.1: Implement hook**

```ts
import { useEffect, useState } from 'react';

export interface ChartColors {
  primary: string;       // Main series line
  warning: string;       // Yellow reference line
  danger: string;        // Red reference line
  reference: string;     // Dashed neutral line (contribution baseline)
  text: string;          // Axis/tooltip text
  grid: string;          // Grid lines
}

const LIGHT: ChartColors = {
  primary: '#0a2e1f',
  warning: '#f59e0b',
  danger: '#dc2626',
  reference: '#94a3b8',
  text: '#3d5a4d',
  grid: '#e4e4e7',
};

const DARK: ChartColors = {
  primary: '#a7f3d0',       // emerald-200 — visible on dark surface
  warning: '#fbbf24',       // amber-400
  danger: '#f87171',        // red-400
  reference: '#64748b',     // slate-500
  text: '#9ca3af',          // gray-400
  grid: '#374151',          // gray-700
};

export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(() =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? DARK
      : LIGHT,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setColors(e.matches ? DARK : LIGHT);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return colors;
}
```

- [ ] **Step 2.2: Use in CashflowTab**

In `src/components/feature/stats/CashflowTab.tsx`, import the hook + replace hardcoded stroke colors:

```tsx
import { useChartColors } from '@/lib/chart-colors';

// inside the component:
const colors = useChartColors();

// In the LineChart:
<ReferenceLine y={threshold} stroke={colors.warning} strokeDasharray="4 4" />
<ReferenceLine y={0} stroke={colors.danger} strokeDasharray="4 4" />
<Line type="monotone" dataKey="funBalance" stroke={colors.primary} strokeWidth={2} dot={false} />
```

Also pass `tick={{ fill: colors.text }}` to YAxis if it's visible.

- [ ] **Step 2.3: Use in BacktestPanel**

In `src/components/feature/advisor/BacktestPanel.tsx`, same pattern:

```tsx
import { useChartColors } from '@/lib/chart-colors';

const colors = useChartColors();

<ReferenceLine y={result.totalContributed} stroke={colors.reference} strokeDasharray="4 4" />
<Line type="monotone" dataKey="value" stroke={colors.primary} strokeWidth={2} dot={false} />
```

- [ ] **Step 2.4: TS + commit**

```
cd "/Users/benji/Desktop/Apps/Persönliche Budgeting App" && npx tsc -p tsconfig.app.json --noEmit
git add src/lib/chart-colors.ts src/components/feature/stats/CashflowTab.tsx src/components/feature/advisor/BacktestPanel.tsx
git commit -m "feat(charts): theme-aware Recharts colors for dark mode"
```

---

## Task 3: Categorization-Memory Pure Module

**Files:**
- Create: `src/modules/categorization-memory/index.ts`
- Create: `tests/modules/categorization-memory.test.ts`

- [ ] **Step 3.1: Tests**

```ts
import { describe, it, expect } from 'vitest';
import { suggestRuleFromChange, normalizeForPattern } from '@/modules/categorization-memory';
import type { CategoryRule } from '@/db/types';

describe('normalizeForPattern', () => {
  it('lowercases and trims', () => {
    expect(normalizeForPattern('  REWE Berlin  ')).toBe('rewe berlin');
  });
  it('collapses whitespace', () => {
    expect(normalizeForPattern('Circle  Club   Berlin')).toBe('circle club berlin');
  });
});

describe('suggestRuleFromChange', () => {
  const existingRules: CategoryRule[] = [
    {
      id: 'r1', counterpartyPattern: 'rewe', matchType: 'regex',
      category: 'lebensmittel', createdBy: 'system', hitCount: 0, lastUsed: null,
      createdAt: '2026-01-01',
    },
  ];

  it('returns suggestion when counterparty has no matching rule yet', () => {
    const r = suggestRuleFromChange({
      counterparty: 'Späti Görli',
      oldCategory: 'restaurants',
      newCategory: 'nightlife',
      existingRules,
    });
    expect(r).not.toBeNull();
    expect(r!.counterpartyPattern.toLowerCase()).toContain('späti');
    expect(r!.category).toBe('nightlife');
  });

  it('returns null when an existing rule already matches the counterparty', () => {
    const r = suggestRuleFromChange({
      counterparty: 'REWE Berlin',
      oldCategory: 'lebensmittel',
      newCategory: 'lebensmittel',
      existingRules,
    });
    expect(r).toBeNull();
  });

  it('returns null when old and new category are identical', () => {
    const r = suggestRuleFromChange({
      counterparty: 'Späti Görli',
      oldCategory: 'nightlife',
      newCategory: 'nightlife',
      existingRules,
    });
    expect(r).toBeNull();
  });

  it('returns null for empty counterparty', () => {
    const r = suggestRuleFromChange({
      counterparty: '',
      oldCategory: 'restaurants',
      newCategory: 'nightlife',
      existingRules,
    });
    expect(r).toBeNull();
  });

  it('produces exact-match pattern by default (not regex)', () => {
    const r = suggestRuleFromChange({
      counterparty: 'Circle Club',
      oldCategory: 'restaurants',
      newCategory: 'nightlife',
      existingRules: [],
    });
    expect(r!.matchType).toBe('exact');
    expect(r!.counterpartyPattern).toBe('circle club');
  });
});
```

- [ ] **Step 3.2: Implement**

```ts
import type { CategoryRule, MatchType } from '@/db/types';

export interface SuggestRuleInput {
  counterparty: string;
  oldCategory: string;
  newCategory: string;
  existingRules: CategoryRule[];
}

export interface SuggestedRule {
  counterpartyPattern: string;
  matchType: MatchType;
  category: string;
}

export function normalizeForPattern(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Decides whether to surface a "make this a rule"-suggestion to the user.
 * Returns null when:
 *   - counterparty is empty
 *   - old/new categories are identical (nothing changed)
 *   - an existing rule already matches the counterparty
 *
 * Otherwise returns a rule sketch (exact-match by default).
 */
export function suggestRuleFromChange(input: SuggestRuleInput): SuggestedRule | null {
  if (!input.counterparty.trim()) return null;
  if (input.oldCategory === input.newCategory) return null;

  const normalized = normalizeForPattern(input.counterparty);
  if (!normalized) return null;

  // If any existing rule (regex or exact) already covers this counterparty,
  // don't double-suggest — the existing rule should be the source of truth
  // (the user can edit it via the rules editor if they want it changed).
  for (const rule of input.existingRules) {
    if (ruleMatches(rule, normalized)) return null;
  }

  return {
    counterpartyPattern: normalized,
    matchType: 'exact',
    category: input.newCategory,
  };
}

function ruleMatches(rule: CategoryRule, normalizedCounterparty: string): boolean {
  if (rule.matchType === 'exact') {
    return rule.counterpartyPattern.toLowerCase() === normalizedCounterparty;
  }
  try {
    return new RegExp(rule.counterpartyPattern, 'i').test(normalizedCounterparty);
  } catch {
    return false;
  }
}
```

- [ ] **Step 3.3: Tests pass + commit**

```
cd "/Users/benji/Desktop/Apps/Persönliche Budgeting App" && npx vitest run tests/modules/categorization-memory.test.ts
git add src/modules/categorization-memory/index.ts tests/modules/categorization-memory.test.ts
git commit -m "feat(categorization): pure rule-suggestion helper"
```

---

## Task 4: Rule-Suggestion Prompt + Wire into CategoryDrilldownSheet

**Files:**
- Create: `src/components/feature/categorization/RuleSuggestionPrompt.tsx`
- Modify: `src/components/feature/stats/CategoryDrilldownSheet.tsx`

- [ ] **Step 4.1: Prompt component**

A non-modal banner that appears when there's a suggestion. User can "Speichern" (creates rule) or "Nicht jetzt" (dismiss).

```tsx
import { Plus, X } from 'lucide-react';
import type { SuggestedRule } from '@/modules/categorization-memory';

interface Props {
  suggestion: SuggestedRule;
  onAccept: () => void;
  onDismiss: () => void;
}

export function RuleSuggestionPrompt({ suggestion, onAccept, onDismiss }: Props) {
  return (
    <div className="rounded-[16px] border border-forest-200 bg-forest-50 p-3 dark:border-forest-700 dark:bg-forest-900/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-forest-900 dark:text-forest-200">
            Künftige <span className="italic">„{suggestion.counterpartyPattern}"</span> auch als <span className="font-bold">{suggestion.category}</span> einordnen?
          </div>
          <div className="mt-1 text-[11px] text-forest-800/80 dark:text-forest-300/80">
            Erspart dir die manuelle Re-Kategorisierung beim nächsten Mal.
          </div>
        </div>
        <button type="button" onClick={onDismiss} className="text-forest-800 dark:text-forest-300" aria-label="Verwerfen">
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="flex items-center gap-1 rounded-full bg-forest-700 px-3 py-1 text-[12px] font-semibold text-white"
        >
          <Plus className="h-3 w-3" strokeWidth={2.5} />
          Regel speichern
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full bg-surface px-3 py-1 text-[12px] font-medium text-ink-muted"
        >
          Nicht jetzt
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.2: Wire into CategoryDrilldownSheet**

Read `src/components/feature/stats/CategoryDrilldownSheet.tsx`. The handleRecheck function calls `recategorizeWithLLM` and writes updates. After it succeeds, we want to inspect which transactions had a `category` change and suggest rules.

Modify the LLM-recheck flow:
1. After collecting `r.value` (the new categorizations), compare each one to the original `category` from `lowConfidence[out.localId]`.
2. For each transaction where `out.category !== original.category`, call `suggestRuleFromChange` to compute a rule sketch.
3. **Group by counterparty + new category** — if 3 transactions all moved "REWE" from `sonstiges` to `lebensmittel`, only one suggestion is needed.
4. Store suggestions in state; render them at the top of the sheet via `RuleSuggestionPrompt`.

Code sketch for the flow:

```tsx
import { suggestRuleFromChange, type SuggestedRule } from '@/modules/categorization-memory';
import { categoryRulesRepo } from '@/db/repositories/categoryRules';
import { RuleSuggestionPrompt } from '@/components/feature/categorization/RuleSuggestionPrompt';
import { generateId } from '@/lib/id';
import { nowIso } from '@/lib/date';
// ... existing imports

const [suggestions, setSuggestions] = useState<SuggestedRule[]>([]);

const handleRecheck = async () => {
  // ... existing setup ...
  if (r.ok) {
    const db = await getDB();
    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    const rulesR = await categoryRulesRepo.findAll();
    const existingRules = rulesR.ok ? rulesR.value : [];

    const newSuggestions = new Map<string, SuggestedRule>();
    await Promise.all(
      r.value.map(async (out) => {
        const original = lowConfidence[out.localId];
        if (!original) return;
        if (out.category !== original.category) {
          const s = suggestRuleFromChange({
            counterparty: original.counterparty,
            oldCategory: original.category,
            newCategory: out.category,
            existingRules,
          });
          if (s) newSuggestions.set(`${s.counterpartyPattern}|${s.category}`, s);
        }
        const updated: Transaction = {
          ...original,
          category: out.category,
          categoryConfidence: out.confidence,
        };
        await store.put(updated);
      }),
    );
    await tx.done;
    setSuggestions(Array.from(newSuggestions.values()));
    onRecategorized();
  }
};

const acceptSuggestion = async (sug: SuggestedRule) => {
  await categoryRulesRepo.upsert({
    id: generateId(),
    counterpartyPattern: sug.counterpartyPattern,
    matchType: sug.matchType,
    category: sug.category,
    createdBy: 'user',
    hitCount: 0,
    lastUsed: null,
    createdAt: nowIso(),
  });
  setSuggestions((prev) => prev.filter((s) => s !== sug));
};

const dismissSuggestion = (sug: SuggestedRule) => {
  setSuggestions((prev) => prev.filter((s) => s !== sug));
};
```

Render the prompts at the top of the sheet content:
```tsx
{suggestions.length > 0 && (
  <div className="mb-3 space-y-2">
    {suggestions.map((s) => (
      <RuleSuggestionPrompt
        key={`${s.counterpartyPattern}|${s.category}`}
        suggestion={s}
        onAccept={() => void acceptSuggestion(s)}
        onDismiss={() => dismissSuggestion(s)}
      />
    ))}
  </div>
)}
```

Also reset `suggestions` to `[]` when the sheet closes (so they don't persist).

- [ ] **Step 4.3: TS + commit**

```
git add src/components/feature/categorization/RuleSuggestionPrompt.tsx src/components/feature/stats/CategoryDrilldownSheet.tsx
git commit -m "feat(categorization): suggest rules after LLM re-check"
```

---

## Task 5: Transaction Edit-Method in Repo

**Files:**
- Modify: `src/db/repositories/transactions.ts`

- [ ] **Step 5.1: Add updateAnnotation method**

Add to `transactionsRepo`:

```ts
import { computeTransactionHash } from '@/lib/hash';

// ...

/**
 * Updates "annotation" fields of a transaction (counterparty, category, date,
 * description). Amount, sourceCsvId, and other structural fields are NOT
 * editable here — those would require account-balance reversals.
 *
 * When `counterparty` or `date` change, the transactionHash is recomputed
 * so dedupe still works on re-imports.
 */
async updateAnnotation(
  id: string,
  patch: {
    counterparty?: string;
    category?: string;
    date?: string;
    description?: string | null;
  },
): Promise<Result<Transaction>> {
  return tryAsync(async () => {
    const db = await getDB();
    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    const existing = await store.get(id);
    if (!existing) throw new Error('Transaction not found');

    const updated: Transaction = {
      ...existing,
      counterparty: patch.counterparty ?? existing.counterparty,
      category: patch.category ?? existing.category,
      date: patch.date ?? existing.date,
      description: patch.description !== undefined ? patch.description : existing.description,
      isUserReviewed: 1,            // any manual edit counts as reviewed
      categoryConfidence: 1,        // user-set => max confidence
    };

    // Recompute hash if anything that goes into it changed
    if (patch.counterparty !== undefined || patch.date !== undefined) {
      updated.transactionHash = await computeTransactionHash({
        date: updated.date,
        amount: updated.amount,
        counterparty: updated.counterparty,
      });
    }

    await store.put(updated);
    await tx.done;
    return updated;
  });
},
```

- [ ] **Step 5.2: TS + commit**

```
cd "/Users/benji/Desktop/Apps/Persönliche Budgeting App" && npx tsc -p tsconfig.app.json --noEmit
git add src/db/repositories/transactions.ts
git commit -m "feat(db): transaction annotation-edit method"
```

---

## Task 6: EntryDetailsSheet Edit-Mode

**Files:**
- Modify: `src/components/feature/dashboard/EntryDetailsSheet.tsx`

- [ ] **Step 6.1: Add edit-mode toggle**

Read the existing `EntryDetailsSheet.tsx`. Currently it shows details + delete button. Add:
- An "Edit"-button next to the details (icon only, top-right of the sheet OR as a secondary footer button)
- When edit-mode is on: render the same fields as inputs/selectors instead of read-only spans
- "Speichern" + "Abbrechen" buttons in edit-mode

Edit only applies to `expense` transactions (not `income` entries — those are split across accounts and edits would need re-allocation, out of scope).

```tsx
// State:
const [editing, setEditing] = useState(false);
const [editCounterparty, setEditCounterparty] = useState('');
const [editCategory, setEditCategory] = useState('');
const [editDate, setEditDate] = useState('');
const [editDescription, setEditDescription] = useState('');

// When edit mode opens:
const startEdit = () => {
  if (!selection || selection.kind !== 'expense') return;
  const t = selection.transaction;
  setEditCounterparty(t.counterparty);
  setEditCategory(t.category);
  setEditDate(t.date);
  setEditDescription(t.description ?? '');
  setEditing(true);
};

const saveEdit = async () => {
  if (!selection || selection.kind !== 'expense') return;
  const r = await transactionsRepo.updateAnnotation(selection.transaction.id, {
    counterparty: editCounterparty.trim(),
    category: editCategory.trim(),
    date: editDate,
    description: editDescription.trim() || null,
  });
  if (r.ok) {
    pushToast('Eintrag aktualisiert ✓', 'success');
    onDeleted(); // reuse the "reload data" callback
    onOpenChange(false);
    setEditing(false);
  } else {
    pushToast(`Fehler: ${r.error.message}`, 'error');
  }
};
```

Replace the read-only ExpenseDetails fields with form fields when `editing === true`. Categories use a free-text input (or a `<select>` populated from `VALID_CATEGORIES`).

Footer in edit-mode: "Abbrechen" + "Speichern" instead of "Eintrag löschen".

Header: small "Bearbeiten" pencil-icon button next to the title.

- [ ] **Step 6.2: TS + commit**

```
git add src/components/feature/dashboard/EntryDetailsSheet.tsx
git commit -m "feat(dashboard): inline edit for expense annotations"
```

---

## Task 7: Build Validation

- [ ] **Step 7.1: Full build + tests**

```
cd "/Users/benji/Desktop/Apps/Persönliche Budgeting App"
npm run build
npx vitest run
```

Expected: build succeeds, all tests pass (121 from before + 6 new categorization-memory = 127).

- [ ] **Step 7.2: Sanity grep**

```
grep -rn 'console\.\(log\|debug\|warn\|error\)' src/ | grep -v 'src/lib/debug.ts'
```
Expected: 0.

- [ ] **Step 7.3: Tag + commit**

```
git commit --allow-empty -m "chore: quality improvements complete (chart colors + smart-memory + edit + cashflow threshold)"
git tag -a quality-improvements-2026-05-13 -m "Smart Finance Companion — quality batch"
```

---

## Self-Review

**Coverage:** 4 features + 1 known-gap fix all covered.

**Out of scope (deliberately):** No income entry edit (would require splitting/re-allocating). No amount/account edit on expenses. No automated rule-suggestion from CSV-import flow (only LLM-recheck path) — that could be a future addition if useful.
