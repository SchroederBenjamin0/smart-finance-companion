# UI-Konsistenz & Polish — Design-Spec

**Datum:** 2026-06-16
**Status:** Freigegeben (Brainstorming abgeschlossen)
**Scope-Entscheidung:** Konsistenz & Polish (kein Redesign). Ansatz: **Token-first**.
**Look & Brand bleiben erkennbar.** Keine Layout-Umbauten, keine neuen Features.

## Ziel

Die UI ist bereits auf einem soliden, kohärenten Design-System aufgebaut
(Forest/Mint-Palette, semantische `ink/paper/surface`-Tokens mit Dark-Mode via
CSS-Variablen, `card`/`btn-*`/`input-field`/`pill-chip`-Klassen). Es haben sich
aber Inkonsistenzen eingeschlichen, die Konsistenz **und** Lesbarkeit/Hierarchie
beeinträchtigen. Diese werden zentral (Token-first) behoben und dann per Sweep
über die Codebasis angewendet.

Datenbasis (Scan vom 2026-06-16):
- **14** verschiedene Schriftgrößen (`text-[9px]`…`text-[44px]`), davon 7 im
  Bereich 9–15px → keine klare Typo-Hierarchie.
- **9** Radien-Varianten (`rounded-[22px]`, `2xl`, `xl`, `lg`, `[16px]`,
  `[14px]`, `[28px]`, `rounded`, `full`).
- `.card`-Klasse existiert, **15 Dateien** duplizieren das Muster inline.
- Pictogramm-Emojis als UI-Icons in ~13 Dateien.
- Kontrast: `text-ink-subtle` (#7a8c84) auf Weiß ≈ **3,6:1** (unter WCAG-AA
  4,5:1); Fun-/Investment-Karten-Gradients mit weißem Text ≈ **~2:1**.

## Workstreams

### 1 — Typo-Skala (Tailwind `theme.extend.fontSize`)

Benannte, semantische Größen einführen (erzeugen `text-<name>`-Utilities). Die
hochfrequenten Stufen 11/12/13/15 bleiben als Layout-Rhythmus erhalten; nur
Ausreißer werden auf die nächste Stufe gezogen.

| Name | px | Verwendung |
|------|----|-----------|
| `caption` | 11 | Mikro-Labels, Zeitstempel |
| `meta` | 12 | Sekundärtext, Unterzeilen |
| `label` | 13 | Labels, Pills, Sektionsmeta |
| `body` | 15 | Fließtext, Listentitel |
| `heading` | 17 | Sektions-/Karten-Überschriften |
| `title` | 22 | Screen-Titel |
| `display-sm` | 28 | sekundäre Hero-Zahlen |
| `display` | 40 | primäre Hero-Beträge |

**Mapping-Regel für den Sweep:**
`9/10 → caption(11)` · `11 → caption` · `12 → meta` · `13 → label` ·
`14/15 → body(15)` · `16/17/18 → heading(17)` · `22 → title` ·
`28 → display-sm` · `36/40/44 → display(40)`.

Line-Heights pro Stufe in der Config mitgeben. Exakte Hero-Größen (Workstream
greift 36/44 → 40) werden in der visuellen Stichprobe gegengeprüft.

### 2 — Radien-Skala (Tailwind `theme.extend.borderRadius`)

Vier semantische Stufen + `full`:

| Name | px | Verwendung |
|------|----|-----------|
| `card` | 22 | Karten, Sheets, große Flächen |
| `control` | 16 | Buttons, Inputs |
| `chip` | 12 | kleine Kacheln, Tags |
| `full` | – | Pills, Icon-Buttons, Avatare |

**Mapping:** `[22px] → card` · `2xl(16) → control` · `xl(12) → chip` ·
`[16px] → control` · `[14px] → chip` · `[28px] → card` · verirrte
`rounded`(4)/`lg`(8) → `chip` (case-by-case). `full` bleibt.
Die Komponenten-Klassen (`.card`, `.btn-*`, `.input-field`, `.pill-chip`) in
`index.css` werden auf die semantischen Radien umgestellt (px-Werte bleiben
identisch — reine Benennung + Ausreißer-Korrektur).

### 3 — Karten & Listen vereinheitlichen

Die 15 Dateien mit inline `rounded-[22px] bg-surface … shadow-card` auf die
bestehende `.card`-Klasse umstellen (bzw. `.card-tight` für `p-3`-Varianten).
Listen-Container analog (`.row-divider` + `.card` kombinierbar). Eine Quelle der
Wahrheit; künftige Änderungen an einer Stelle.

### 4 — Alle Emojis raus → lucide

Zentrale Icon-Map einführen (z.B. `src/lib/account-icons.ts`):

| Stelle | jetzt | neu (lucide) |
|--------|-------|--------------|
| Fun-Konto | 🎉 | `Sparkles` |
| Sparkonto | 🏦 / 💰 | `PiggyBank` |
| Investment | 📈 | `TrendingUp` |
| PIN-Gate | 🔒 | `Lock` |
| Welcome | 💰 | `Wallet` |
| Cashflow-Warnung rot | 🛑 | `OctagonAlert` |
| Cashflow/Anomalie gelb | ⚠️ | `TriangleAlert` |
| „unsicher"-Hinweis | ⚠️ | `TriangleAlert` (inline, klein) |
| Stats-Leerzustand | 📤 | Text umformulieren bzw. `FileUp`-Icon inline |

Betroffene Dateien: `AccountCardCarousel`, `Income`, `IncomeHistoryList`,
`IncomeHistorySheet`, `RulesStep`, `RulesEditorSheet`, `PinGate`, `WelcomeStep`,
`CashflowWarningBanner`, `AnomalyBanner`, `CategoryDrilldownSheet`, `Stats`.

Zusätzlich: redundante `✓` aus Toast-Texten entfernen (EntryDetailsSheet,
OnboardingShell, LoansSection ×2, Settings ×6, ActivationStep) — der Toast
signalisiert Erfolg bereits farblich. (Pfeil-Glyphen `→`/`↔` in **Code-
Kommentaren** sind nicht betroffen.)

### 5 — Kontrast: kein heller Text auf hellen Flächen

- **`--color-ink-subtle`** (Sekundärtext, 100+ Verwendungen): Light-Mode
  #7a8c84 (≈3,6:1 auf Weiß) → abdunkeln auf **≥4,5:1** (Ziel ~#586b61, final
  per Kontrast-Check). Dark-Mode #6b7280 (≈3,3:1 auf #1f2937) → aufhellen auf
  ≥4,5:1 (Ziel ~#9aa6af). Ein Token-Wert → wirkt überall.
- **`--color-ink-muted`** prüfen (Light ≈7,5:1 ok) — voraussichtlich keine
  Änderung.
- **Account-Karten-Gradients** (`tailwind.config` `backgroundImage`): weißer
  Text auf hellem Grün ist schlecht lesbar.
  - `card-fun` (#10b981→#22c55e, ≈2:1) → vertiefen (Brand-Hue bleibt).
  - `card-investment` (#065f46→#10b981) → helles Ende vertiefen.
  - `card-savings` (#0a4d2e→#16a34a) → ggf. helles Ende leicht vertiefen
    (optional, ist bereits dunkler).
  - On-Card-Sekundärtext (`opacity-80/90` weiß) auf ausreichenden Kontrast
    prüfen, ggf. Opazität anheben.

## Out of Scope (bewusst, jetzt nicht)

- Dark-Mode der **Recharts**-Farben (bekannte Lücke, nicht priorisiert).
- Spacing-Overhaul (nur 2 Sonderwerte gefunden — vernachlässigbar).
- Layout-Umbauten, neue Features, Navigations-Änderungen.

## Verifikation

- `npx tsc -b --noEmit` sauber.
- `npm run build` erfolgreich.
- `npx vitest run` grün (Pure-Logic-Tests sind von UI-Änderungen unberührt).
- **Visuelle Stichprobe** im Visual Companion: Vorher/Nachher von Dashboard +
  einem dichten Screen (Stats oder Settings).
- Kontrast-Werte der gewählten Token rechnerisch gegen WCAG-AA (4,5:1
  Normaltext) geprüft.

## Risiken & Mitigation

- **Großer Sweep** (Typo/Radien berühren viele Dateien): rein mechanisch.
  Mitigation: zuerst Tokens definieren, dann Sweep, dann Build + visuelle
  Kontrolle; in überschaubaren Batches mit Zwischen-Typecheck.
- **Icon-Wechsel ändert den visuellen Charakter** (Emojis → lucide): vom
  Eigentümer ausdrücklich gewünscht. Visuelle Stichprobe bestätigt das Ergebnis.
- **Kontrast-Abdunklung** könnte „flacher" wirken: Werte minimal über der
  AA-Schwelle wählen, im Companion gegenprüfen.
