# UI-Flows-Spec

## Layout-Grundgerüst

iPhone 13 Viewport: 390x844px (im Portrait).

**App-Shell**:
```
┌──────────────────────────┐
│  Status Bar (iOS native) │
├──────────────────────────┤
│                          │
│                          │
│      View Content        │ ← scrollbar
│                          │
│                          │
├──────────────────────────┤
│  [🏠] [➕] [💳] [📊] [⚙️] │ ← Bottom Tab Bar
│  Home Add  Subs Inv  Set │
└──────────────────────────┘
```

Bottom-Tab-Höhe: 80px inkl. Safe-Area.
Content-Padding: 16px horizontal, 16px vertical.

## Onboarding-Flow (First-Time-Setup)

Wird angezeigt wenn IndexedDB leer ist.

### Schritt 1: Welcome
- Headline: "Smart Finance Companion"
- Subheadline: "Deine private Finanz-App für ein besseres Geld-Bewusstsein"
- "Jetzt einrichten" Button

### Schritt 2: API-Keys
- Eingabefeld: Anthropic API Key (Type: password)
- Eingabefeld: Marketaux API Key (Type: password, optional)
- Hinweis: "Diese Keys werden lokal in deinem Gerät gespeichert und
  niemals an einen Server gesendet."
- "Weiter" — testet beide Keys mit einem Probe-Call

### Schritt 3: Allocation-Regeln
- Slider 1: "Hauptjob — wie viel ins Investment?" (Default 45%)
- Slider 2: "Hauptjob — wie viel aufs Sparkonto?" (Default 25%)
- Auto-berechnet: "Fun-Geld: 30%"
- Hinweis: "Du kannst das später jederzeit in Settings ändern"
- Wiederhole für DJ-Regel
- "Weiter"

### Schritt 4: Notgroschen-Ziel
- Eingabe: "Wie hoch soll dein Notgroschen sein?" (Default 3300 €)
- Hinweis: "Faustregel: 3 Monatsausgaben"
- "Weiter"

### Schritt 5: Subscriptions
- Liste der vorgeschlagenen Subscriptions (siehe `datenmodell.md`)
- Pro Item: Checkbox + editierbarer Betrag
- "Hinzufügen"-Button für eigene Subs
- "Fertig"

### Schritt 6: Aktivierung
- Hinweis: "Damit Push-Notifications funktionieren, füge die App zum
  Home-Bildschirm hinzu."
- Visuelle Anleitung: Safari Share-Button → "Zum Home-Bildschirm"
- Dann: "App schließen und vom Home-Bildschirm öffnen"

## Tab 1: Dashboard (Home)

**Above-the-fold (sichtbar ohne Scroll)**:

```
┌──────────────────────────┐
│  Mai 2026                │
│                          │
│  ┌────────────────────┐ │
│  │ 🎉 Fun-Geld         │ │
│  │ 142,50 €            │ │
│  └────────────────────┘ │
│                          │
│  ┌────────────────────┐ │
│  │ 💰 Sparkonto        │ │
│  │ 1.847,00 €  (56%)   │ │
│  │ ▓▓▓▓▓▓░░░░ Ziel:3.3k│ │
│  └────────────────────┘ │
│                          │
│  ┌────────────────────┐ │
│  │ 📈 Investment       │ │
│  │ 4.328,42 € (+2,3%)  │ │
│  └────────────────────┘ │
└──────────────────────────┘
```

**Below-the-fold**:
- Letzte 5 Transaktionen / Eingaben
- "Nächste Subscription am 15.05.: Splice 13,23 €"
- Falls AI-Empfehlung pending: gelbe Banner-Card "Sparplan-Vorschlag bereit"
- Falls Markt-Anomalie: graue Info-Card "NVIDIA -8% gestern. Info, kein Trigger."

**Pull-to-Refresh**: Triggert Watchdog manuell.

## Tab 2: Eingabe (Add)

Floating Action Button "+" als Quick-Add.
Tab-Inhalt: Formular für neuen Eintrag.

**Form**:
```
┌──────────────────────────┐
│  Neue Einnahme           │
│                          │
│  Betrag (€):             │
│  [        ]              │
│                          │
│  Quelle:                 │
│  ○ Hauptjob              │
│  ● DJ-Gig                │
│  ○ Sonstiges             │
│                          │
│  Datum: [05.05.2026]    │
│                          │
│  Notiz (optional):       │
│  [                    ]  │
│                          │
│  ┌────────────────────┐ │
│  │  Vorschau:          │ │
│  │  📈 Investment 60%  │ │
│  │  💰 Sparkonto  20%  │ │
│  │  🎉 Fun-Geld   20%  │ │
│  └────────────────────┘ │
│                          │
│  [   Erfassen   ]       │
└──────────────────────────┘
```

Bei großen Beträgen (>500€): zusätzlicher Hinweis
"AI-Empfehlung wird nach Erfassung erstellt"

## Tab 3: Subscriptions

**Liste-View**:

```
┌──────────────────────────┐
│  Subscriptions           │
│                          │
│  Gesamt: 53,47 €/Monat  │
│                          │
│  ┌──────────────────┐   │
│  │ Lexware          │   │
│  │ 12,90 € · monatl.│   │
│  │ Nächste: 15.05.  │   │
│  └──────────────────┘   │
│                          │
│  ┌──────────────────┐   │
│  │ Splice Serum     │   │
│  │ 8,53 € · 4 Monate│   │
│  │ ⏳ Endet 09.2026 │   │
│  └──────────────────┘   │
│                          │
│  ... weitere ...         │
│                          │
│  [+ Subscription hinzu]  │
└──────────────────────────┘
```

Tap auf Item → Detail-View mit Edit/Delete.

## Tab 4: Investments

**Hauptansicht**:

```
┌──────────────────────────┐
│  Investments             │
│                          │
│  Gesamt: 4.328,42 €     │
│  Eingezahlt: 4.100,00 €  │
│  Performance: +5,57%     │
│                          │
│  Drift-Status:           │
│  ✓ Alles im Soll-Bereich │
│                          │
│  Holdings:               │
│  ┌──────────────────┐   │
│  │ MSCI World       │   │
│  │ 2.745 € (63%)    │   │
│  │ Ziel: 65%        │   │
│  └──────────────────┘   │
│  ... weitere ...         │
│                          │
│  [+ Position erfassen]  │
│  [↻ Daten aktualisieren] │
└──────────────────────────┘
```

Sub-Tab "Empfehlung" (wenn pending):

```
┌──────────────────────────┐
│  Mai-Empfehlung          │
│                          │
│  Verfügbar: 470 €        │
│                          │
│  Vorschlag:              │
│  ┌──────────────────┐   │
│  │ MSCI World 230 € │   │
│  │ MSCI EM     90 € │   │
│  │ Nasdaq      70 € │   │
│  │ Cash        80 € │   │
│  └──────────────────┘   │
│                          │
│  Begründung:             │
│  "Tech-Übergewichtung    │
│   wächst, mehr World."   │
│                          │
│  [In TR öffnen]          │
│  [Anpassen] [Skip]       │
└──────────────────────────┘
```

## Tab 5: Insights

Drei Sub-Tabs: Ausgaben, Einnahmen, Trends.

**Ausgaben-Tab**:
- Pie-Chart pro Kategorie (Recharts)
- Liste mit Top-Kategorien des Monats
- Vergleich zum Vormonat (+/- in %)

**Trends-Tab**:
- Liniendiagramm der Konto-Stände über Zeit
- Bar-Chart Einnahmen/Ausgaben pro Monat

## Settings

```
┌──────────────────────────┐
│  Einstellungen           │
│                          │
│  Konten & Regeln         ▶│
│  Allokations-Regeln      ▶│
│  Schwellwerte            ▶│
│  Notgroschen-Ziel        ▶│
│  ─────────────────────  │
│  API-Keys                ▶│
│  Daten exportieren       ▶│
│  Daten importieren       ▶│
│  Diagnose-Log            ▶│
│  ─────────────────────  │
│  API-Kosten diesen Monat │
│  3,42 €                  │
│  ─────────────────────  │
│  Über die App            ▶│
│  Lizenz: Privat-Nutzung  │
└──────────────────────────┘
```

## Component-Konventionen

### Tap-Targets
Alle interaktiven Elemente: min 44x44px Tap-Target.

### Cards
- Background: weiß im Light-Mode, dunkelgrau im Dark-Mode
- Border-Radius: 12px
- Padding: 16px
- Shadow: subtle (`shadow-sm` in Tailwind)

### Buttons
- Primary: voll-gefüllt, App-Akzentfarbe
- Secondary: Outline-Style
- Destructive: rot
- Min-Höhe: 48px

### Loading-States
- Skeleton-Loaders für Listen
- Spinner für Single-Actions
- Niemals leerer State ohne Indikator

### Error-States
- Toast-Notifications (oben am Bildschirm) für transient errors
- Inline-Errors in Forms
- Full-Screen-Error-View nur bei DB-Crash

## Dark-Mode

Default: Follow-System.
Settings: Override-Option (Light/Dark/System).

Tailwind: `dark:` Prefix für alle Color-Classes.

## Animations

Sparsam einsetzen. Erlaubt:
- Tab-Transitions (slide)
- Card-Hover-Lift (auf Mac mit Maus)
- Form-Validation-Shake bei Errors
- Number-Counter bei Konto-Stand-Updates

Verboten:
- Aufwendige Lottie-Animations
- Parallax-Scroll
- Sticker-Effekte

## Accessibility

- Alle Inputs haben `aria-label`
- Color-Contrast min WCAG AA
- Focus-States sichtbar (Tailwind: `focus-visible:ring`)
- Keine info-only-via-color (immer Text+Icon)
