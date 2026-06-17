# Design: Umbuchungs-Tracking & Daten-Löschen

> Datum: 2026-06-09
> Branch: `feat/categorizer-and-subs-improvements`
> Status: Genehmigt (User-Approval am 2026-06-09)

## Problem

Beim Revolut-CSV-Import stimmt der Sparkonto-Saldo der App nicht mit der
Realität überein (App zeigt ~500 €, echter Revolut-Schlussstand 375,33 €),
und Umbuchungen zwischen Fun- und Sparkonto werden in den Anzeigen wie
Ausgaben/Einnahmen dargestellt, obwohl es nur Verschiebungen zwischen den
eigenen Konten sind.

### Root-Cause-Analyse

Die Revolut-CSV (`consolidated_statement`) enthält zwei Konten:

- `Personal Account (EUR)` → **Fun-Konto** (Girokonto)
- `Savings (EUR)` / „Instant Access Savings" → **Sparkonto**

Alle Umbuchungen stehen im **Fun-Konto-Transaktionsabschnitt**:

- `"To Instant Access Savings"` (negativ) → Geld geht Fun → Spar
- `"From Instant Access Savings"` (positiv) → Geld geht Spar → Fun

Zwei getrennte Bugs:

1. **Sparkonto-Saldo wird beim Import nie aktualisiert.** Der Parser leitet
   `finalBalances.savings` aus dem „Savings"-*Transaktions*-Abschnitt ab —
   dieser enthält aber nur Zinsbuchungen in einem anderen Datumsformat
   (`4/3/26`), die der Parser überspringt. Dadurch ist `finalBalances.savings`
   immer `null`, und `setBalance('savings', …)` in `CsvImportSheet` läuft nie.
   Der angezeigte Sparkonto-Saldo ist reine Akkumulation aus
   Einkommens-Allokationen (`income.ts` addiert bei jedem Income die geplante
   Spar-Quote via `addToBalance`) und wird nie gegen die Realität abgeglichen.
   Der echte Schlussstand steht sauber im CSV-Header:
   `Savings → Deposit value → "Closing balance" €375,33`.

2. **Umbuchungen werden als Ausgabe/Einnahme dargestellt.** Die
   Kategorisierung funktioniert bereits (Seed-Regeln in
   `INTERNAL_TRANSFER_PATTERNS` matchen `To/From Instant Access Savings` →
   Kategorie `umbuchung`), und die Spending-Stats schließen `umbuchung`
   korrekt aus (`NON_SPENDING_CATEGORIES`). Aber zwei Render-Stellen färben
   jede negative Zeile rot bzw. positive grün, unabhängig von der Kategorie:
   - `CsvImportSheet`-ReviewRow (`isExpense = amount < 0`)
   - Dashboard `RecentList` (`isIncoming = amount >= 0`)

## Lösung

### Teil A — Korrekter Sparkonto-Saldo & neutrale Umbuchungs-Darstellung

**A1. CSV-Parser liest echte Schlussstände** — `src/services/revolutCsvImport.ts`

Zusätzlich zur Transaktionsschleife wird die Zusammenfassungs-Sektion
ausgewertet. Es wird ein `section`-Status mitgeführt
(`'current' | 'savings'`), der auf den Sektion-Headern umschaltet
(`Personal Account (EUR)` → `current`, `/^Savings/i` → `savings`). Bei einer
Zeile mit `row[2] === 'Closing balance'` wird `parseMoney(row[3])` als
Schlussstand des aktuellen Abschnitts gespeichert.

Da „Closing balance"-Zeilen nur im Summary-Bereich (vor den
Transaktions-Statements) vorkommen, ist die Reihenfolge unkritisch: die
Summary-Werte werden gesetzt, bevor die gleichnamigen Transaktions-Header
auftauchen, und nicht überschrieben.

`finalBalances`-Ableitung (mit Fallback für Robustheit):

- `finalBalances.current` = Summary-Closing-Balance Personal Account
  (Fallback: bisheriger letzter-Buchung-Saldo aus dem Transaktionsabschnitt)
- `finalBalances.savings` = Summary-Closing-Balance Savings
  (Fallback: letzter-Buchung-Saldo; vorher immer `null`)

Transaktions-Parsing bleibt unverändert. Dadurch ruft `CsvImportSheet`
`setBalance('savings', finalBalances.savings)` erstmals wirksam auf — der
Sparkonto-Saldo wird bei jedem Import auf den echten Bank-Schlussstand
re-verankert (berücksichtigt automatisch Round-ups + Zinsen).

**A2. Umbuchungen neutral darstellen**

Kleiner Shared-Helper `isInternalTransfer(category): boolean`
(= `category === 'umbuchung'`), platziert neben `isNonSpending` in
`src/modules/spending/index.ts` (natürliche Heimat, wird von `Stats.tsx`
schon importiert).

Anpassungen:

- **`CsvImportSheet`-ReviewRow**: Ist die Kategorie `umbuchung`, wird die
  Zeile neutral gerendert — neutrale Farbe (kein Rot), ⇄-Icon, Label
  „Umbuchung" statt rotem „−200 €". Vorzeichen entfällt zugunsten eines
  Transfer-Hinweises (z.B. „↔ Sparkonto").
- **`RecentList`** (Dashboard): Umbuchung bekommt neutrales ⇄-Icon und
  neutrale Einfärbung statt rot (Ausgabe) bzw. grün (Einnahme).

`transfer` (Zahlungen an Dritte) bleibt eine echte rote Ausgabe — nur
`umbuchung` wird neutralisiert. Spending-Stats (`Stats.tsx`,
`aggregateByCategory`) bleiben unverändert, da `umbuchung` dort schon
ausgeschlossen ist.

### Teil B — Daten-Löschen in den Einstellungen

Neue Sektion „Daten löschen" in `src/views/Settings.tsx` mit vier Aktionen.
Jede Aktion ist destruktiv und wird mit `window.confirm` und einer klaren
deutschen Meldung bestätigt (konsistent mit dem bestehenden „App
zurücksetzen"-Flow). Nach Erfolg: betroffene Zustand-Stores neu laden +
Erfolgs-Toast.

Die Lösch-Logik liegt in einem neuen Repository
`src/db/repositories/dataMaintenance.ts`, das Object-Store-genaue,
typisierte Clear-Funktionen exportiert und `getDB()` nutzt
(Result-Pattern, keine `any`).

| Aktion | Löscht | Behält |
|---|---|---|
| **Nur Abos löschen** | `subscriptions` | alles andere |
| **Nur Revolut-CSV löschen** | `transactions` (alle, inkl. manuelle) + `csvImports` | Konten-Salden bleiben unangetastet (separat in „Konten-Salden" editierbar) |
| **Nur Trade-Republic-Positionen löschen** | `investmentPositions` + `priceCache` + `newsCache` | Advisor-Verlauf (`recommendations`, `newsEvents`) bleibt |
| **Alle Finanzdaten löschen** | `incomeEntries`, `allocations`, `subscriptions`, `transactions`, `csvImports`, `investmentPositions`, `loans`, `recommendations`, `newsEvents`, `priceCache`, `newsCache`; Konten-Salden (fun/savings/investment) → 0; Config-Keys `legacyInvestmentBalance` + `legacyInvestmentBannerDismissed` | **API-Key (`secrets`), PIN, Onboarding-Status, Allokations-Regeln, Income-Schwellwerte, Allocation-Target, Kategorie-Regeln, Theme, Drift/Cashflow-Schwellen, Reclassify-Flags, `appLog`** |

Designentscheidungen (vom User bestätigt):

- „Nur Revolut-CSV löschen" entfernt **alle** Transaktionen (auch manuelle)
  + CSV-Import-Records, lässt aber die Salden unangetastet.
- „Nur TR-Positionen" lässt den Advisor-Verlauf
  (`recommendations`/`newsEvents`) stehen.
- „Alle Finanzdaten löschen" ist bewusst **schwächer** als das bestehende
  „App zurücksetzen" (welches auch Key/PIN/Onboarding wischt und neu
  onboarded). Konten-Rows bleiben erhalten (Saldo auf 0 gesetzt), um die
  „3 Konten existieren immer"-Invariante nicht zu brechen.

## Betroffene Dateien

- `src/services/revolutCsvImport.ts` — Summary-Closing-Balance-Parsing (A1)
- `src/components/feature/imports/CsvImportSheet.tsx` — neutrale Umbuchungs-Row (A2)
- `src/components/feature/dashboard/RecentList.tsx` — neutrale Umbuchungs-Row (A2)
- `src/modules/spending/index.ts` — `isInternalTransfer` (A2)
- `src/db/repositories/dataMaintenance.ts` — **neu**, Clear-Funktionen (B)
- `src/views/Settings.tsx` — Sektion „Daten löschen" + Confirm-Flows (B)

## Tests

- `tests/services/revolutCsvImport.test.ts`: gegen eine Fixture prüfen, dass
  `finalBalances.savings === 375.33` und `finalBalances.current === 29.87`.
- Optional: Repository-Test für `dataMaintenance` mit `fake-indexeddb`
  (Setup in `tests/setup.ts` vorhanden) — verifiziert, dass die korrekten
  Stores geleert und die geschützten Stores (secrets, appConfig-Settings)
  erhalten bleiben.

## Nicht im Scope

- Keine Modellierung jeder einzelnen Umbuchung als explizite Fund-Bewegung
  (verworfen zugunsten des authoritativen Schlussstands — einfacher,
  robuster, keine Doppelzählung bei Mehrfach-Imports).
- Keine Änderung an der Income-Allokations-Logik (`income.ts` addiert
  weiterhin Spar-Quoten; der CSV-Import re-verankert den Saldo bei jedem
  Import auf die Realität).
