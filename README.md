# Smart Finance Companion

Persönliche Finanz-PWA für ein iPhone 13.

## ⚠️ Wichtiger Hinweis

Diese App ist ein **persönliches Tool für den Eigentümer dieses Repos**.
Sie ist **keine Anlageberatung** und nicht für die Nutzung durch andere
Personen gedacht. Details siehe `specs/regulatorisch.md`.

## Quick Start für Claude Code

1. Lies `CLAUDE.md` als Projekt-Kontext
2. Aktueller Sprint: **Sprint 1** — siehe `specs/sprint-1.md`
3. Bei Detailfragen: passende Spec-Datei in `specs/` konsultieren
4. Beim Coden die Code-Qualität-Regeln aus `CLAUDE.md` befolgen

## Quick Start für den User

### Setup (einmalig)

```bash
# 1. Repo klonen
git clone https://github.com/<dein-username>/smart-finance-companion
cd smart-finance-companion

# 2. Node.js 20+ installiert? Sonst: https://nodejs.org

# 3. Dependencies installieren
npm install

# 4. Lokal starten (zum Testen)
npm run dev
# → öffnet http://localhost:5173

# 5. Build prüfen
npm run build
npm run preview
```

### Deployment auf GitHub Pages

```bash
# Erstmaliges Setup:
# - GitHub Repo erstellen
# - Settings → Pages → Source: GitHub Actions
# - Diesen Code pushen:

git add .
git commit -m "Initial commit"
git push origin main

# GitHub Action deployt automatisch.
# Nach ~2 Minuten ist die App live unter:
# https://<dein-username>.github.io/smart-finance-companion
```

### Auf iPhone installieren

1. Safari auf iPhone öffnen
2. URL der App eingeben
3. Share-Button → "Zum Home-Bildschirm"
4. App-Icon vom Home-Screen öffnen
5. Onboarding durchlaufen (API-Keys eingeben)

## Spec-Übersicht

| Datei | Inhalt |
|-------|--------|
| `CLAUDE.md` | Haupt-Kontext für Claude Code |
| `specs/architektur.md` | Drei-Schichten-Modell, Modul-API, PWA-Constraints |
| `specs/datenmodell.md` | IndexedDB-Schema, TypeScript-Types, Initial-Daten |
| `specs/llm-prompts.md` | System-Prompts für alle 4 LLM-Use-Cases |
| `specs/ui-flows.md` | Mobile-First Layout, alle Tabs, Onboarding |
| `specs/api-integrationen.md` | Anthropic, Yahoo, Marketaux, TR Deep-Links |
| `specs/deployment.md` | GitHub Pages Setup, GitHub Actions |
| `specs/security.md` | API-Key-Handling, Encryption, PIN-Lock |
| `specs/regulatorisch.md` | BaFin, KWG, was du nicht tun darfst |
| `specs/sprint-1.md` | Foundation: PWA + Onboarding + Allocation |
| `specs/sprint-2.md` | Subscriptions + CSV-Import + Categorizer |
| `specs/sprint-3.md` | Investment-Tracking + Yahoo + Drift |
| `specs/sprint-4.md` | AI-Advisor + Notifications + Watchdog |

## Voraussetzungen

- **Node.js 20+**
- **iPhone 13** (oder neuer) mit iOS 16.4+
- **Anthropic API-Key** ([console.anthropic.com](https://console.anthropic.com))
- **Marketaux API-Key** (optional, für News:
  [marketaux.com](https://marketaux.com))
- **GitHub-Account** mit Pages aktiviert

## Geschätzte API-Kosten

3-8 € pro Monat für Anthropic API bei normaler Nutzung.

## Tech-Stack

- React 18 + TypeScript + Vite
- Tailwind CSS + Radix UI
- IndexedDB (idb library)
- Zustand (State Management)
- PWA via vite-plugin-pwa
- Recharts (Diagramme)

## License

MIT — mit dem expliziten Verständnis, dass dies **keine Finanzberatung**
ist und auf eigene Gefahr genutzt wird.
