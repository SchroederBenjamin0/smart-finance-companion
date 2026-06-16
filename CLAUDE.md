# Smart Finance Companion — Projekt-Kontext

> **Wichtig für Claude Code**: Dies ist die Haupt-Kontextdatei.
> Lies sie vor jeder Aufgabe. Bei Konflikten zwischen Anweisungen gilt
> immer die spezifischste Spec-Datei in `specs/`.

## Was wir bauen

Eine persönliche Finanz-PWA für **eine einzige Nutzerin** (den Eigentümer
dieses Projekts). Sie hilft beim intelligenten Verteilen von Einnahmen auf
drei Konten (Fun-Geld, Sparkonto, Investment-Konto), kategorisiert Ausgaben
aus Revolut-CSV-Imports mittels LLM, und liefert konservative
ETF-Sparplan-Empfehlungen.

**Die App ist explizit NICHT für andere Nutzer gedacht.** Sie wird nicht im
App Store veröffentlicht. Sie wird nicht weitergegeben. Das hat
regulatorische Gründe (siehe `specs/regulatorisch.md`).

## Tech-Stack (final)

- **App-Typ**: Progressive Web App (PWA) für iPhone 13 (iOS 16.4+)
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **UI-Komponenten**: Radix UI Primitives (für Dialoge, Selects, etc.)
- **Charts**: Recharts
- **State**: Zustand (lightweight, perfekt für PWA)
- **Datenbank**: IndexedDB via `idb` Library (typed wrapper)
- **CSV-Parser**: PapaParse
- **LLM**: Anthropic Claude API (User gibt Key beim ersten Start ein)
- **Marktdaten**: Yahoo Finance via `yahoo-finance2` (oder direkter HTTP-Call,
  da das Package serverseitig denkt)
- **News**: Marketaux API (Free Tier: 100 calls/Tag)
- **Hosting**: GitHub Pages (statisches Deploy via GitHub Actions)
- **Domain**: GitHub-default (z.B. `username.github.io/smart-finance`),
  später custom domain wenn gewünscht

## Distribution

Die App wird als PWA auf das iPhone 13 installiert:
1. User öffnet die GitHub-Pages-URL in Safari
2. Tippt auf Share-Button → "Zum Home-Bildschirm"
3. App liegt als Icon auf dem Home-Screen, läuft im Vollbild ohne Browser-UI

**iOS PWA Limitierungen, die das Design prägen** (siehe auch
`specs/architektur.md`):

- ❌ Keine Background-Tasks → "check-on-open" Modell
- ❌ Kein Auto-Refresh wenn App geschlossen
- ❌ Storage kann nach 7+ Tagen Nicht-Nutzung gelöscht werden → Auto-Backup nötig
- ✅ Push-Notifications funktionieren ab iOS 16.4 (nur wenn App zum
  Home-Screen hinzugefügt wurde)
- ✅ Offline-Modus mit Service Worker
- ✅ Native-App-Look ohne Browser-Chrome

## Sicherheit: API-Key-Handling

**Der Anthropic-API-Key wird NIEMALS im Code stehen.** Stattdessen:

1. Beim ersten App-Start zeigt die App einen Onboarding-Screen
2. User gibt Anthropic-Key + Marketaux-Key ein
3. Keys werden in IndexedDB gespeichert (`secrets` store)
4. Optional: Verschlüsselung mit User-Passwort (siehe `specs/security.md`)

Die Repo ist **public auf GitHub**, deshalb ist diese Trennung absolut kritisch.

## Projekt-Struktur

```
smart-finance-companion/
├── CLAUDE.md                          # Du bist hier
├── README.md                          # User-facing setup
├── package.json
├── tsconfig.json
├── vite.config.ts                     # Inkl. PWA Plugin
├── tailwind.config.ts
├── .github/
│   └── workflows/
│       └── deploy.yml                 # GitHub Pages Auto-Deploy
├── public/
│   ├── manifest.json                  # PWA Manifest
│   ├── icon-192.png
│   ├── icon-512.png
│   └── favicon.ico
├── specs/                             # Detail-Specs (lies bei Bedarf)
│   ├── architektur.md
│   ├── datenmodell.md
│   ├── llm-prompts.md
│   ├── ui-flows.md
│   ├── api-integrationen.md
│   ├── deployment.md
│   ├── security.md
│   ├── regulatorisch.md
│   ├── sprint-1.md
│   ├── sprint-2.md
│   ├── sprint-3.md
│   └── sprint-4.md
├── src/
│   ├── main.tsx                       # Entry Point
│   ├── App.tsx                        # Root Component + Routing
│   ├── components/                    # UI Components
│   │   ├── ui/                        # Radix-basierte Primitives
│   │   ├── layout/                    # AppShell, BottomNav
│   │   └── feature/                   # Feature-spezifische Components
│   ├── views/                         # Top-Level Views (Tabs)
│   │   ├── Dashboard.tsx
│   │   ├── Income.tsx
│   │   ├── Subscriptions.tsx
│   │   ├── Investments.tsx
│   │   ├── Insights.tsx
│   │   └── Settings.tsx
│   ├── modules/                       # Backend-Logik (Pure Functions)
│   │   ├── income-detector/
│   │   ├── categorizer/
│   │   ├── advisor/
│   │   ├── allocation/
│   │   └── watchdog/
│   ├── services/                      # External APIs
│   │   ├── claude.ts
│   │   ├── yahoo.ts
│   │   └── marketaux.ts
│   ├── db/                            # IndexedDB
│   │   ├── schema.ts                  # Object Stores Definition
│   │   ├── migrations.ts
│   │   ├── repositories/              # Repository Pattern pro Entity
│   │   └── types.ts                   # TypeScript Types
│   ├── stores/                        # Zustand Stores
│   ├── lib/                           # Helpers
│   │   ├── result.ts                  # Result<T, E> Type
│   │   ├── id.ts                      # UUID Generator
│   │   ├── date.ts
│   │   └── currency.ts
│   └── workers/
│       └── service-worker.ts          # PWA Service Worker
└── tests/                             # Vitest Tests
    ├── modules/
    └── lib/
```

## Sprint-Plan

Vier zweiwöchige Sprints. Pro Sprint eine eigene Spec mit Definition of Done.

| Sprint | Ziel | Spec |
|--------|------|------|
| 1 | Foundation: PWA läuft, Onboarding, Allocation-Engine | `specs/sprint-1.md` |
| 2 | Subscriptions, CSV-Import mit Kategorisierung | `specs/sprint-2.md` |
| 3 | Investment-Tracking, Yahoo-Daten, Drift | `specs/sprint-3.md` |
| 4 | AI-Advisor, lokale Notifications, News-Filter | `specs/sprint-4.md` |

**Aktueller Sprint**: 1 (zu starten)

## Code-Qualität-Regeln

1. **TypeScript strict mode** — kein `any`. Stattdessen `unknown` mit
   Type-Guards.
2. **Keine Default Exports** außer für React Components mit Lazy-Loading.
3. **Result-Pattern statt try/catch** in Services — siehe `src/lib/result.ts`.
4. **Tests für alle Pure Functions** in `src/modules/` und `src/lib/`.
   UI-Tests sind nicht erforderlich.
5. **Keine externen UI-Frameworks außer Tailwind + Radix.** Keine Material UI,
   kein Chakra, keine fertigen Dashboard-Templates.
6. **Pseudo-Anonymisierung vor Claude-API-Calls** — Counterparty-Namen werden
   gehashed bevor sie an Claude gehen (Details in `specs/llm-prompts.md`).
7. **Mobile-First Tailwind** — alle Views werden zuerst für 390px iPhone
   Viewport designed, dann ggf. für größere Screens angepasst.
8. **PWA-Best-Practices** — Service Worker, Manifest, Offline-Fallback,
   Lighthouse-PWA-Score muss bei 100 liegen.

## Persönliche Daten der Nutzerin

Werden bei der ersten App-Nutzung im Onboarding erfasst und in IndexedDB
gespeichert. **NICHT** im Code hardcoden.

Einzige Ausnahme: die initiale Subscription-Liste (Lexware, Splice, etc.)
als Vorschlag im Onboarding (siehe `specs/sprint-1.md`).

## Wenn du etwas nicht weißt

- API-Spezifika: zuerst die offizielle Doku, dann web search
- Capacitor und PWA-Best-Practices: https://web.dev/progressive-web-apps/
- Anthropic API: https://docs.anthropic.com/en/api/getting-started
- Bei Unsicherheit: frag den User, schreibe nicht spekulativ

## Was du NIEMALS tust

- Investment-Empfehlungen mit Markt-Timing implementieren
- Krypto-Empfehlungs-Logik einbauen (außer expliziter User-Anfrage)
- Auto-Execute-Funktionen für Trades vorschlagen
- Verkaufs-Empfehlungen aus Meinung/„Stock-Picking" geben — ERLAUBT ist nur deterministisch gekapptes **Trim-to-Target-Rebalancing** (Übergewicht → Ziel), nie Markt-Timing, nie Auto-Execute
- API-Keys als Konstanten oder Defaults im Code einfügen
- Code für Multi-User-Setup schreiben (das wäre BaFin-relevant)
- Background-Tasks oder Cron-Jobs annehmen (PWA-Limitierung!)
- Native-iOS-spezifische APIs nutzen (kein Capacitor in dieser Version)
- Dependencies hinzufügen ohne `package.json` Update zu erklären
