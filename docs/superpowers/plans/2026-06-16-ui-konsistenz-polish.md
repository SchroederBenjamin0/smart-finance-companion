# UI-Konsistenz & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vereinheitliche Typo-/Radien-Skala, Karten, Iconografie (Emojis → lucide) und behebe Kontrastprobleme — zentral (Token-first), ohne Look/Brand zu verändern.

**Architecture:** Zuerst Design-Tokens zentral definieren (`tailwind.config.ts`, `src/index.css`) und eine zentrale Icon-Map (`src/lib/account-icons.tsx`). Dann mechanischer Sweep über Views/Components, der Ad-hoc-Werte durch die Tokens ersetzt. Verifikation pro Task via `tsc` + `build`; am Ende visuelle Vorher/Nachher-Stichprobe.

**Tech Stack:** React 18, TypeScript (strict), Tailwind CSS, lucide-react, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-16-ui-konsistenz-polish-design.md`

---

## File Structure

**Tokens / zentral:**
- `tailwind.config.ts` — `theme.extend.fontSize` (Typo-Skala), `borderRadius` (Radien-Skala), `backgroundImage` (vertiefte Karten-Gradients).
- `src/index.css` — `--color-ink-subtle` (Light/Dark) abdunkeln/aufhellen; Komponenten-Klassen (`.card`, `.btn-*`, `.input-field`, `.pill-chip`) auf semantische Radien.
- `src/lib/account-icons.tsx` — **neu**: zentrale `ACCOUNT_ICON`-Map (lucide) + Re-Exports der Banner-/Lock-Icons.

**Sweep (mechanisch, betrifft viele Dateien):** alle `src/views/**` und `src/components/**`.

Reihenfolge ist wichtig: **Tokens zuerst** (Tasks 1–3), **dann** der Sweep (Tasks 4–6), sonst zeigt der Build unbekannte Utility-Klassen.

---

## Task 1: Design-Tokens in tailwind.config.ts

**Files:**
- Modify: `tailwind.config.ts` (`theme.extend.fontSize`, `borderRadius`, `backgroundImage`)

- [ ] **Step 1: fontSize-Skala ergänzen**

In `theme.extend` einen `fontSize`-Block hinzufügen (erzeugt `text-caption` … `text-display`):

```ts
      fontSize: {
        caption: ['11px', { lineHeight: '1.3' }],
        meta: ['12px', { lineHeight: '1.35' }],
        label: ['13px', { lineHeight: '1.4' }],
        body: ['15px', { lineHeight: '1.45' }],
        heading: ['17px', { lineHeight: '1.3' }],
        title: ['22px', { lineHeight: '1.2' }],
        'display-sm': ['28px', { lineHeight: '1.1' }],
        display: ['40px', { lineHeight: '1.0' }],
      },
```

- [ ] **Step 2: borderRadius-Skala ergänzen**

Im bestehenden `borderRadius`-Block die semantischen Namen ergänzen (4xl/5xl bleiben):

```ts
      borderRadius: {
        card: '22px',
        control: '16px',
        chip: '12px',
        '4xl': '32px',
        '5xl': '40px',
      },
```

- [ ] **Step 3: Karten-Gradients vertiefen (Kontrast)**

Den `backgroundImage`-Block ersetzen (Brand-Hue bleibt, helle Enden werden vertieft, damit weißer Text lesbar ist):

```ts
      backgroundImage: {
        'hero-forest': 'linear-gradient(160deg, #0a4d2e 0%, #22c55e 100%)',
        'card-fun': 'linear-gradient(150deg, #0a7d50, #13a35a)',
        'card-savings': 'linear-gradient(150deg, #0a4d2e, #138a40)',
        'card-investment': 'linear-gradient(150deg, #065f46, #0c8a5a)',
      },
```

- [ ] **Step 4: Typecheck + Build**

Run: `npx tsc -b --noEmit && npm run build`
Expected: beides ohne Fehler (Config ist gültiges TS, neue Utilities werden generiert).

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat(ui): add typo/radius scale tokens and deepen card gradients"
```

---

## Task 2: Kontrast-Tokens + Komponenten-Radien in index.css

**Files:**
- Modify: `src/index.css` (`:root`, dark `@media`, `@layer components`)

- [ ] **Step 1: ink-subtle abdunkeln (Light) / aufhellen (Dark)**

Light-Mode `:root` — `--color-ink-subtle` von `#7a8c84` auf einen AA-tauglichen Wert ändern:

```css
  --color-ink-subtle: #5f7168; /* war #7a8c84 (3,6:1) → ~5,3:1 auf Weiß */
```

Dark-Mode `@media (prefers-color-scheme: dark)` — `--color-ink-subtle` von `#6b7280` aufhellen:

```css
    --color-ink-subtle: #9aa6af; /* war #6b7280 (3,3:1) → ~4,8:1 auf #1f2937 */
```

- [ ] **Step 2: Komponenten-Klassen auf semantische Radien**

In `@layer components` die Radien-Utilities ersetzen (px bleiben identisch):
- `.card` / `.card-tight`: `rounded-[22px]` → `rounded-card` (card-tight: `rounded-2xl` → `rounded-control`)
- `.btn-primary` / `.btn-secondary` / `.btn-destructive` / `.btn-ghost`: `rounded-2xl` → `rounded-control`
- `.input-field`: `rounded-2xl` → `rounded-control`
- `.pill-chip`: `rounded-full` bleibt

- [ ] **Step 3: Build + Kontrast-Check**

Run: `npx tsc -b --noEmit && npm run build`
Expected: kein Fehler.
Kontrolle (manuell): die gewählten ink-subtle-Werte rechnerisch ≥ 4,5:1 gegen `#ffffff`/`#f2f2f7` (Light) bzw. `#1f2937` (Dark). Falls knapp, Wert minimal nachziehen.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "fix(ui): raise ink-subtle contrast to WCAG AA, use semantic radii in component classes"
```

---

## Task 3: Zentrale Icon-Map (src/lib/account-icons.tsx)

**Files:**
- Create: `src/lib/account-icons.tsx`

- [ ] **Step 1: Datei anlegen**

```tsx
import {
  Sparkles,
  PiggyBank,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import type { AccountType } from '@/db/types';

/**
 * Single source of truth for the account/allocation icons used across the
 * income, dashboard, rules and onboarding surfaces. Replaces the former
 * 🎉/🏦/📈 emojis with consistent lucide glyphs.
 */
export const ACCOUNT_ICON: Record<AccountType, LucideIcon> = {
  fun: Sparkles,
  savings: PiggyBank,
  investment: TrendingUp,
};
```

(Hinweis: Falls `AccountType` Werte enthält, die hier nicht abgebildet werden sollen, stattdessen einen schmaleren Union-Typ `'fun' | 'savings' | 'investment'` verwenden — siehe `AccountType`-Definition in `src/db/types.ts`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: kein Fehler (Record deckt alle AccountType-Keys ab).

- [ ] **Step 3: Commit**

```bash
git add src/lib/account-icons.tsx
git commit -m "feat(ui): add central lucide account-icon map"
```

---

## Task 4: Emojis → lucide (Icon-Sweep)

**Files (alle Modify):**
- `src/components/feature/dashboard/AccountCardCarousel.tsx`
- `src/views/Income.tsx`
- `src/components/feature/income/IncomeHistoryList.tsx`
- `src/components/feature/income/IncomeHistorySheet.tsx`
- `src/components/feature/onboarding/RulesStep.tsx`
- `src/components/feature/settings/RulesEditorSheet.tsx`
- `src/components/feature/onboarding/WelcomeStep.tsx`
- `src/components/feature/lock/PinGate.tsx`
- `src/components/feature/dashboard/CashflowWarningBanner.tsx`
- `src/components/feature/imports/AnomalyBanner.tsx`
- `src/components/feature/stats/CategoryDrilldownSheet.tsx`
- `src/views/Stats.tsx`

- [ ] **Step 1: Konten-Trio-Stellen auf ACCOUNT_ICON umstellen**

Für jede Stelle, die ein 🎉/🏦/📈 (bzw. 💰 für Sparkonto) als Konten-Icon zeigt, das Emoji durch das gemappte lucide-Icon ersetzen. Muster (Beispiel `AccountCardCarousel.tsx`): das `META`-Objekt führt statt `emoji: '🎉'` ein `Icon: ACCOUNT_ICON.fun` und rendert `<Icon className="h-[22px] w-[22px]" strokeWidth={2.25} />` an der Stelle des Emoji-`<div>`.

Konkret pro Datei:
- `AccountCardCarousel.tsx`: `META` um `Icon: LucideIcon` erweitern (`fun: Sparkles`, `savings: PiggyBank`), Emoji-`<div className="text-[22px] …">{meta.emoji}</div>` → `<meta.Icon className="h-6 w-6" strokeWidth={2.25} />`; die separate Portfolio-Karte `📈` → `<TrendingUp className="h-6 w-6" strokeWidth={2.25} />` (Import aus `lucide-react`).
- `Income.tsx`: die Optionsliste (`{ id:'fun', label:'Fun-Geld', emoji:'🎉' }` …) auf `Icon: ACCOUNT_ICON[id]` umstellen; die `<… emoji="…">`-Renderstellen (L346/352/358) auf `<Icon …/>`.
- `IncomeHistoryList.tsx` / `IncomeHistorySheet.tsx`: die `Chip`/Renderkomponente nimmt statt `emoji: string` ein `Icon: LucideIcon`; Aufrufe `emoji="🎉|🏦|📈"` → `Icon={ACCOUNT_ICON.fun|savings|investment}`.
- `RulesStep.tsx` / `RulesEditorSheet.tsx`: `<span>📈 Investment</span>` etc. → `<span className="inline-flex items-center gap-1.5"><TrendingUp className="h-4 w-4"/> Investment</span>` (analog Sparkonto→PiggyBank, Fun→Sparkles; 💰 Sparkonto → PiggyBank).
- `WelcomeStep.tsx`: `💰` → `<Wallet className="h-…"/>` (Import `Wallet`).

- [ ] **Step 2: Banner-/Status-Emojis ersetzen**

- `CashflowWarningBanner.tsx` L53: `const icon = severity === 'red' ? '🛑' : '⚠️';` → ein lucide-Icon wählen: `const Icon = severity === 'red' ? OctagonAlert : TriangleAlert;` und an der Render-Stelle `<Icon className="h-… w-…" />` statt des Emoji-Strings.
- `AnomalyBanner.tsx` L15: führendes `⚠️` → `<TriangleAlert className="h-4 w-4" />` (inline vor dem Text, `inline-flex items-center gap-1.5`).
- `CategoryDrilldownSheet.tsx` L153: `' · ⚠️ unsicher'` → das `⚠️` durch ein kleines inline-`<TriangleAlert className="inline h-3 w-3 align-[-2px]" />` ersetzen (JSX statt String).
- `Stats.tsx` L235 (Leerzustand): `Tippe auf 📤 oben rechts, …` → Text umformulieren auf „Tippe oben rechts auf **Importieren**, …" (kein Inline-Emoji) ODER `<FileUp className="inline h-4 w-4" />` einsetzen.

- [ ] **Step 3: Redundante ✓ aus Toast-Texten entfernen**

In folgenden Dateien das abschließende `' ✓'` aus den `pushToast(..., 'success')`-Strings entfernen (Toast signalisiert Erfolg bereits farblich):
`EntryDetailsSheet.tsx`, `OnboardingShell.tsx`, `LoansSection.tsx` (2×), `Settings.tsx` (6×), `ActivationStep.tsx`.
Beispiel: `pushToast('Saldo aktualisiert ✓', 'success')` → `pushToast('Saldo aktualisiert', 'success')`.

- [ ] **Step 4: Verify — keine Pictogramm-Emojis mehr**

Run:
```bash
python3 - <<'PY'
import os,re
emoji=re.compile("[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U00002B00-\U00002BFF]")
for root,_,fs in os.walk("src"):
  for f in fs:
    if f.endswith((".tsx",".ts")):
      p=os.path.join(root,f)
      for i,l in enumerate(open(p,encoding="utf-8"),1):
        if any(emoji.match(c) for c in l): print(f"{p}:{i}: {l.strip()[:80]}")
PY
```
Expected: keine Treffer mehr in Render-/UI-Strings (Pfeil-Glyphen `→`/`↔` in Code-Kommentaren sind ok und vom Regex ohnehin ausgenommen).

- [ ] **Step 5: Typecheck + Build**

Run: `npx tsc -b --noEmit && npm run build`
Expected: kein Fehler.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "refactor(ui): replace UI emojis with lucide icons, drop redundant toast checkmarks"
```

---

## Task 5: Typografie-Sweep (Ad-hoc-Größen → Skala)

**Files:** alle `src/views/**/*.tsx` und `src/components/**/*.tsx`

- [ ] **Step 1: Mechanische Ersetzung pro Größe**

Reihenfolge beachten (von groß nach klein bei zweistelligen, damit z.B. `text-[15px]` nicht von `text-[1…]` geteilt wird — `\Q…\E` matcht aber literal, daher unkritisch). Befehle (macOS/perl, literal-match):

```bash
cd "$(git rev-parse --show-toplevel)"
files=$(grep -rlE "text-\[[0-9]+px\]" src --include='*.tsx')
for f in $files; do
  perl -pi -e '
    s/\Qtext-[9px]\E/text-caption/g;
    s/\Qtext-[10px]\E/text-caption/g;
    s/\Qtext-[11px]\E/text-caption/g;
    s/\Qtext-[12px]\E/text-meta/g;
    s/\Qtext-[13px]\E/text-label/g;
    s/\Qtext-[14px]\E/text-body/g;
    s/\Qtext-[15px]\E/text-body/g;
    s/\Qtext-[16px]\E/text-heading/g;
    s/\Qtext-[17px]\E/text-heading/g;
    s/\Qtext-[18px]\E/text-heading/g;
    s/\Qtext-[22px]\E/text-title/g;
    s/\Qtext-[28px]\E/text-display-sm/g;
    s/\Qtext-[36px]\E/text-display/g;
    s/\Qtext-[40px]\E/text-display/g;
    s/\Qtext-[44px]\E/text-display/g;
  ' "$f"
done
```

- [ ] **Step 2: Restbestände prüfen**

Run: `grep -rnE "text-\[[0-9]+px\]" src --include='*.tsx' || echo "clean"`
Expected: `clean` (keine bracket-Größen mehr). Falls Treffer übrig (z.B. exotische px), manuell der nächsten Stufe zuordnen.

- [ ] **Step 3: Typecheck + Build**

Run: `npx tsc -b --noEmit && npm run build`
Expected: kein Fehler; neue `text-*`-Utilities existieren (Task 1).

- [ ] **Step 4: Commit**

```bash
git add -A src
git commit -m "refactor(ui): map ad-hoc font sizes onto semantic typo scale"
```

---

## Task 6: Radien-Sweep + Karten-Vereinheitlichung

**Files:** alle `src/views/**/*.tsx` und `src/components/**/*.tsx`

- [ ] **Step 1: Bracket- und Tailwind-Radien auf semantische Namen**

```bash
cd "$(git rev-parse --show-toplevel)"
files=$(grep -rlE "rounded(-(2xl|xl|lg))?(-\[[0-9]+px\])?" src --include='*.tsx')
for f in $files; do
  perl -pi -e '
    s/\Qrounded-[22px]\E/rounded-card/g;
    s/\Qrounded-[28px]\E/rounded-card/g;
    s/\Qrounded-[16px]\E/rounded-control/g;
    s/\Qrounded-[14px]\E/rounded-chip/g;
    s/\brounded-2xl\b/rounded-control/g;
    s/\brounded-xl\b/rounded-chip/g;
    s/\brounded-lg\b/rounded-chip/g;
  ' "$f"
done
```

- [ ] **Step 2: Verbleibende bare `rounded` (4px) manuell prüfen**

Run: `grep -rnE "\"[^\"]*\brounded\b[^-][^\"]*\"|\srounded\s" src --include='*.tsx'`
Für jeden Treffer entscheiden: kleine Kachel/Tag → `rounded-chip`; sonst belassen. (Es sind ~8 Stellen; bewusst manuell, weil `rounded` Substring von `rounded-full` etc. ist.)

- [ ] **Step 3: Inline-Karten auf `.card` umstellen**

Die Dateien mit inline `rounded-card bg-surface … shadow-card` (vormals `rounded-[22px]`) auf die `.card`-Klasse umstellen, wo `p-4` verwendet wird; bei `p-5`/abweichendem Padding `card` + Padding-Override (`className="card p-5"`) nutzen; `p-3`-Varianten → `card-tight`.
Run zum Finden: `grep -rn "rounded-card bg-surface" src --include='*.tsx'`
Pro Treffer: `className="… rounded-card bg-surface p-4 … shadow-card …"` → `className="card …"` (verbleibende Layout-Utilities behalten). Beispiel `RecentList.tsx` Leerzustand + Container, `CashflowTab.tsx`, `Investments.tsx`-Boxen.

- [ ] **Step 4: Restbestände prüfen**

Run: `grep -rnE "rounded-(2xl|xl|lg)\b|rounded-\[[0-9]+px\]" src --include='*.tsx' || echo "clean"`
Expected: `clean`.

- [ ] **Step 5: Typecheck + Build**

Run: `npx tsc -b --noEmit && npm run build`
Expected: kein Fehler.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "refactor(ui): unify radii onto semantic scale and use .card class"
```

---

## Task 7: Gesamt-Verifikation + visuelle Stichprobe

**Files:** keine (nur Verifikation)

- [ ] **Step 1: Tests (unberührt) grün**

Run: `npx vitest run`
Expected: alle bestehenden Tests pass (UI-Änderungen berühren keine Pure-Logic).

- [ ] **Step 2: Voller Typecheck + Build**

Run: `npx tsc -b --noEmit && npm run build`
Expected: beides sauber.

- [ ] **Step 3: Visuelle Vorher/Nachher-Stichprobe**

Dev-Server starten (`npm run dev`) und im Visual Companion / Browser Dashboard + einen dichten Screen (Stats oder Settings) im Light- **und** Dark-Mode ansehen. Prüfen:
- Konten-Karten: weißer Text gut lesbar (Gradients vertieft).
- Sekundärtext (ink-subtle) deutlich lesbar, nicht zu blass.
- lucide-Icons sitzen optisch sauber (Größe/Strichstärke) an den vormaligen Emoji-Stellen.
- Keine kaputten Radien/Abstände.

- [ ] **Step 4: Abschluss-Commit (falls visuelle Nachjustierung nötig war)**

```bash
git add -A
git commit -m "polish(ui): visual fine-tuning after consistency sweep"
```

---

## Self-Review (durchgeführt)

- **Spec-Abdeckung:** Workstream 1 (Typo) → Task 1+5; WS2 (Radien) → Task 1+2+6; WS3 (Karten) → Task 6/Step 3; WS4 (Emojis→lucide) → Task 3+4; WS5 (Kontrast) → Task 1/Step 3 (Gradients) + Task 2 (ink-subtle). Verifikation → Task 7. Alle Spec-Punkte abgedeckt.
- **Placeholder-Scan:** keine TBD/TODO; jeder Sweep hat konkrete Befehle, jede Icon-Stelle konkrete Zuordnung.
- **Typ-Konsistenz:** `ACCOUNT_ICON` (Task 3) wird in Task 4 exakt so verwendet; Utility-Namen (`text-meta`/`rounded-control` …) in Tasks 5/6 entsprechen den in Task 1 definierten.
- **Reihenfolge:** Tokens (1–3) vor Sweep (4–6) — verhindert „unknown utility class" im Build.
