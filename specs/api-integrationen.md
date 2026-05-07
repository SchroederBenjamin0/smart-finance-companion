# API-Integrationen-Spec

## Anthropic Claude API

**Endpoint**: `https://api.anthropic.com/v1/messages`

**Authentication**: `x-api-key` Header (User gibt Key beim Onboarding ein)

**Required Headers**:
- `Content-Type: application/json`
- `anthropic-version: 2023-06-01`
- `x-api-key: <user-provided>`

**CORS**: Anthropic API erlaubt CORS aus dem Browser. Stand Mai 2026
funktioniert das. Falls sich das ändert: Cloudflare Worker als Proxy
(siehe unten).

**Modell-Mapping** (wichtig — diese Strings ändern sich, im Code als Konstanten):

```typescript
export const CLAUDE_MODELS = {
  HAIKU: 'claude-haiku-4-5',
  SONNET: 'claude-sonnet-4-6',
  OPUS: 'claude-opus-4-7',
} as const;
```

**Rate Limits**:
- Free Tier (User-Account-abhängig): meist 5 RPM, 25k tokens/min
- Reicht völlig für unseren Use-Case

**Cost-Tracking**: Pro Call wird `usage` Object mitgeliefert.
Logging in `appLog` mit Cost-Berechnung (siehe `sprint-4.md`).

## Yahoo Finance

**Inoffizielle API** (kann sich ändern):

Endpoint: `https://query1.finance.yahoo.com/v7/finance/quote?symbols=...`

**CORS**: Funktioniert in Browsern, aber Yahoo könnte das einschränken.

**Symbol-Format-Hinweise**:
- Deutsche ETFs an XETRA: `IWDA.DE`
- US-Aktien: `AAPL` (kein Suffix)
- Amsterdam: `IWDA.AS`
- ISINs werden NICHT direkt akzeptiert — wir mappen ISIN → Yahoo-Symbol
  in `src/lib/isin-mapper.ts`

**Wichtige ETF-Mappings**:
```typescript
export const ETF_TICKER_MAP: Record<string, string> = {
  'IE00B4L5Y983': 'IWDA.AS',   // iShares Core MSCI World
  'IE00BKM4GZ66': 'EIMI.DE',   // iShares Core MSCI EM IMI
  'IE00B53SZB19': 'CSNDX.DE',  // iShares Nasdaq 100
  // ... weitere
};
```

**Fallback bei API-Ausfall**: Cached-Werte zeigen mit "veraltet seit X"-Badge.

## Marketaux News API

**Endpoint**: `https://api.marketaux.com/v1/news/all`

**Authentication**: `api_token` als URL-Parameter

**Free Tier**: 100 calls/Tag, 3 Artikel pro Call

**Rate Limit Strategy**:
- Bei 5 Holdings: 5 calls/Tag = 500 calls/Monat. Free Tier reicht.
- Cache pro Holding 24h
- Bei Quota-Hit: silent fail, kein Error für User

**Symbol-Format**: Standard-Tickers (AAPL, MSFT, etc.). Für ETFs evtl.
keine News verfügbar — das ist okay, wir filtern eh nach Materialität.

## CORS-Probleme: Cloudflare Worker als Proxy (Fallback)

Falls Yahoo oder Anthropic CORS-Probleme machen, hier die Lösung als Backup.

**Cloudflare Worker** kostet bis 100k Requests/Tag nichts. Setup:

1. Cloudflare-Account anlegen
2. `npx wrangler init` für neuen Worker
3. Code:

```typescript
// proxy-worker.ts
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('target');

    if (!targetUrl) {
      return new Response('Missing target', { status: 400 });
    }

    // Whitelist of allowed targets
    const allowed = [
      'https://query1.finance.yahoo.com',
      'https://api.anthropic.com',
      'https://api.marketaux.com',
    ];

    if (!allowed.some(a => targetUrl.startsWith(a))) {
      return new Response('Forbidden target', { status: 403 });
    }

    const proxied = await fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== 'GET' ? await request.text() : undefined,
    });

    const newHeaders = new Headers(proxied.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(proxied.body, {
      status: proxied.status,
      headers: newHeaders,
    });
  },
};
```

4. `wrangler deploy` → Worker läuft auf
   `https://your-worker.workers.dev`

**WICHTIG**: Wenn du den Worker für Anthropic verwendest, müsste der API-Key
durch den Worker gehen — das ist ein Security-Risiko, weil der Worker dann
deinen Key sieht. Bessere Variante: Worker macht nur Yahoo/Marketaux,
Anthropic geht direkt.

## Trade Republic Universal Links

**Format**: `https://traderepublic.com/de-de/{ISIN}`

Beispiele:
- `https://traderepublic.com/de-de/IE00B4L5Y983` → MSCI World
- `https://traderepublic.com/de-de/IE00BKM4GZ66` → MSCI EM IMI

**Verhalten auf iOS**: Wenn TR-App installiert, öffnet sie direkt.
Sonst öffnet die Web-Variante in Safari.

**Limitation**: Wir können keinen Sparplan-Betrag mitschicken. User muss
manuell eintippen. Aber: App zeigt Beträge auf dem Bildschirm,
User wechselt zu TR, tippt sie ein, kommt zurück.

## Service Worker Cache-Strategie

```typescript
// src/workers/service-worker.ts
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

precacheAndRoute(self.__WB_MANIFEST);

// API calls: Network First, kein Cache (immer fresh)
registerRoute(
  ({ url }) =>
    url.hostname === 'api.anthropic.com' ||
    url.hostname.includes('marketaux.com'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 30,
  })
);

// Yahoo: Network First mit kurzem Cache (4h)
registerRoute(
  ({ url }) => url.hostname.includes('yahoo.com'),
  new NetworkFirst({
    cacheName: 'yahoo-cache',
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 4 * 60 * 60, // 4h
      }),
    ],
  })
);

// Static assets: Cache First
registerRoute(
  ({ request }) =>
    request.destination === 'image' ||
    request.destination === 'font',
  new CacheFirst({
    cacheName: 'static-assets',
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Tage
      }),
    ],
  })
);
```

## Error-Handling pro Service

| Service | Bei Fehler | User-Sichtbar |
|---------|-----------|----------------|
| Claude API | Empfehlung als 'failed' markieren | Banner "AI-Empfehlung fehlgeschlagen, später erneut versuchen" |
| Yahoo Finance | Stale Cache anzeigen | Badge "Daten veraltet seit X" |
| Marketaux | Silent fail | Kein News-Banner |
| TR Deep-Link | Browser-Fallback | TR Web-Page öffnet sich |
