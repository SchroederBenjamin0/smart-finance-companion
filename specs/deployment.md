# Deployment-Spec

## Setup-Schritte (einmalig)

### 1. GitHub-Repo erstellen

```bash
# Auf GitHub: neues Repo "smart-finance-companion"
# Public oder Private — beides funktioniert für GitHub Pages
# (Public bei Free Tier, Private benötigt Pro)

git clone https://github.com/<username>/smart-finance-companion
cd smart-finance-companion
```

### 2. Projekt initialisieren

```bash
npm create vite@latest . -- --template react-ts
npm install
# Weitere Dependencies siehe sprint-1.md Task 1.1
```

### 3. GitHub Pages aktivieren

In GitHub-Repo:
- Settings → Pages
- Source: "GitHub Actions"
- Custom Domain: leer lassen (verwende Default-Subdomain)

### 4. GitHub-Actions-Workflow

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

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build-and-deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test -- --run

      - name: Build
        run: npm run build

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### 5. Vite-Config für GitHub Pages

`vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/smart-finance-companion/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Smart Finance Companion',
        short_name: 'Finance',
        start_url: '/smart-finance-companion/',
        scope: '/smart-finance-companion/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1e40af',
        orientation: 'portrait',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        runtimeCaching: [
          // ... siehe api-integrationen.md
        ],
      },
    }),
  ],
});
```

### 6. PWA-Icons generieren

Tool: https://realfavicongenerator.net oder https://maskable.app

Du brauchst:
- `icon-192.png` (192x192)
- `icon-512.png` (512x512)
- `icon-512-maskable.png` (512x512 mit Safe-Area-Padding)
- `apple-touch-icon.png` (180x180, für iOS Add-to-Home-Screen)
- `favicon.ico`

Alle in `public/` ablegen.

### 7. iOS-spezifische Meta-Tags

`index.html`:

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport"
        content="width=device-width, initial-scale=1.0,
                 viewport-fit=cover" />

  <!-- iOS PWA Meta Tags -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style"
        content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Finance" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

  <!-- Theme Color for status bar -->
  <meta name="theme-color"
        content="#ffffff"
        media="(prefers-color-scheme: light)" />
  <meta name="theme-color"
        content="#1f2937"
        media="(prefers-color-scheme: dark)" />

  <title>Smart Finance Companion</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

## Deployment-Workflow (laufender Betrieb)

```bash
# Lokale Änderungen testen
npm run dev

# Tests laufen lassen
npm test

# Build prüfen lokal
npm run build
npm run preview

# Deployen
git add .
git commit -m "Sprint 1: foundation complete"
git push origin main
# → GitHub Action startet automatisch
# → Nach ~2 Minuten ist die Änderung live
```

## App auf iPhone installieren (User-Schritte)

1. Safari auf iPhone öffnen
2. URL eingeben: `https://<username>.github.io/smart-finance-companion`
3. Warten bis Seite geladen
4. Share-Button (Quadrat mit Pfeil nach oben) tippen
5. Scrollen zu "Zum Home-Bildschirm"
6. Tippen → "Hinzufügen"
7. App-Icon erscheint auf Home-Screen
8. App vom Home-Screen öffnen (NICHT aus Safari heraus, sonst funktionieren
   PWA-Features nicht)
9. Onboarding läuft

**Wichtig**: Damit Push-Notifications funktionieren, muss die App vom
Home-Screen aus geöffnet werden, nicht über Safari.

## Custom Domain (optional, später)

Falls du später eine eigene Domain willst:

1. Domain registrieren (z.B. via Cloudflare ~10 €/Jahr)
2. In GitHub Repo: Settings → Pages → Custom Domain → eintragen
3. DNS bei Cloudflare:
   - CNAME `app` → `<username>.github.io`
4. SSL-Zertifikat: GitHub erstellt automatisch via Let's Encrypt
5. `vite.config.ts`: `base: '/'` setzen (statt
   `/smart-finance-companion/`)

## Backup-Strategie für Code

Code liegt automatisch auf GitHub. Zusätzlich:

- Git Tags pro Sprint-Ende: `git tag -a v0.1 -m "Sprint 1 complete"`
- Branches für experimentelle Features
- Niemals secrets committen — `.gitignore` enthält:
  ```
  .env
  .env.local
  .vscode/settings.json
  *.log
  ```

## Monitoring (lokal)

Da wir kein externes Monitoring haben:

- Settings-View hat "Diagnose-Log anzeigen" mit letzten 100 Errors
- Bei wiederkehrenden Errors: User informiert dich (Bug-Report-Workflow)
- App-Cost-Tracking zeigt API-Verbrauch

## Verfügbarkeits-Annahmen

GitHub Pages: 99.95%+ Uptime (in der Praxis problemlos für persönliche Apps)

Bei GitHub-Ausfall: App läuft weiter (PWA-Cache), nur Updates kommen nicht
durch bis GitHub wieder online.

Bei Anthropic-Ausfall: AI-Empfehlungen pausiert, alles andere funktioniert.

Bei Yahoo-Ausfall: Stale-Daten bleiben sichtbar mit Veraltet-Hinweis.
