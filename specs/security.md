# Security-Spec

## Threat Model

Diese App ist eine private PWA. Threats:

1. **Diebstahl des iPhones** — Angreifer hat physischen Zugriff
2. **Kompromittiertes WLAN** — MITM-Angriff bei API-Calls
3. **Schadcode aus npm-Dependencies** — Supply-Chain-Attack
4. **Code-Inspection durch Dritte** — App ist auf öffentlichem GitHub-Repo
5. **API-Key-Leakage** — Anthropic-Key landet im Code-Repo

## Mitigations

### 1. iPhone-Diebstahl

**Annahme**: iPhone-Diebstahl-Schutz wird durch iOS selbst gehandelt
(Face ID, Auto-Lock, Find My, Erase). Die App vertraut darauf.

**Zusätzliche App-Maßnahme**: Optional kann User in Settings einen
4-stelligen App-PIN setzen. Wird beim Öffnen abgefragt.

```typescript
// src/lib/app-lock.ts
export async function setupAppPin(pin: string): Promise<void> {
  const hash = await hashPin(pin);
  await configRepo.set('app_pin_hash', hash);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await configRepo.get('app_pin_hash');
  if (!stored) return true; // no pin set
  const hash = await hashPin(pin);
  return hash === stored;
}

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`smart-finance-pin-salt-${pin}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
}
```

PIN-Lock ist optional, weil iOS-Auto-Lock die App schon schützt.
User-Default: ausgeschaltet.

### 2. MITM bei API-Calls

**Mitigation**: HTTPS überall. GitHub Pages serviert nur HTTPS, Anthropic
und Yahoo verwenden TLS.

**Certificate Pinning**: nicht möglich in Browser. Wir vertrauen System-CAs.

### 3. NPM Supply-Chain

**Mitigation**:
- `package-lock.json` committen für reproduzierbare Builds
- Dependabot für Security-Alerts aktivieren (kostenlos in GitHub)
- Vor Major-Updates: Changelog lesen
- Keine "trendy" Dependencies — nur etablierte Libraries

**Whitelist** der akzeptierten Dependency-Quellen:
- React, Vite, Tailwind: Core-Stack, gut auditiert
- Radix UI: vertrauenswürdig
- idb: Jake Archibald (Google), gut auditiert
- Recharts: stabil, viele Maintainer
- Zustand: einfach, gut auditiert

**Verboten**:
- Dependencies mit < 1000 weekly downloads
- Dependencies ohne aktiven Maintainer (>6 Monate keine Commits)
- Dependencies mit transitiver Dependency-Hölle (>20 sub-dependencies)

### 4. Public Repo: Code-Inspection

**Was im Repo steht** (öffentlich sichtbar):
- Source Code
- Architektur-Specs
- Build-Workflow

**Was NICHT im Repo steht**:
- API-Keys (User gibt im Onboarding ein)
- Persönliche Finanzdaten (in IndexedDB des Users)
- Deine Allokations-Regeln (in IndexedDB)
- Deine Subscriptions (in IndexedDB)

**Risiko**: Jemand klont den Code und nutzt ihn selbst. Das ist okay —
ist Open-Source-Style.

### 5. API-Key-Handling

**Goldene Regel**: Niemals API-Keys im Code, im Repo, oder in Git-Hooks.

**Wo Keys landen**:
- Beim Onboarding-Schritt 2 gibt User Keys ein
- Keys werden in IndexedDB Store `secrets` gespeichert
- Optional: AES-256 verschlüsselt mit User-Passwort

**IndexedDB-Storage-Code**:

```typescript
// src/db/repositories/secrets.ts
import { Result, ok, err } from '@/lib/result';
import { getDB } from '../client';

const ENCRYPTION_KEY_NAME = 'master_key';

export async function saveSecret(
  key: 'anthropic_key' | 'marketaux_key',
  value: string,
  password?: string
): Promise<Result<void>> {
  if (password) {
    const encrypted = await encrypt(value, password);
    const db = await getDB();
    await db.put('secrets', {
      key,
      encryptedValue: encrypted.ciphertext,
      iv: encrypted.iv,
      createdAt: new Date().toISOString(),
    });
  } else {
    // Without password: store plain in IndexedDB
    // (still safer than localStorage)
    const db = await getDB();
    await db.put('secrets', {
      key,
      encryptedValue: value, // not encrypted
      iv: '',
      createdAt: new Date().toISOString(),
    });
  }
  return ok(undefined);
}

export async function getSecret(
  key: 'anthropic_key' | 'marketaux_key',
  password?: string
): Promise<Result<string>> {
  const db = await getDB();
  const entry = await db.get('secrets', key);
  if (!entry) return err(new Error('Secret not found'));

  if (entry.iv) {
    if (!password) return err(new Error('Password required'));
    const decrypted = await decrypt(
      entry.encryptedValue, entry.iv, password
    );
    return ok(decrypted);
  }
  return ok(entry.encryptedValue);
}
```

**Web Crypto API Encrypt/Decrypt**:

```typescript
// src/lib/crypto.ts
async function deriveKey(password: string,
                         salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(
  plaintext: string, password: string
): Promise<{ ciphertext: string; iv: string }> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  // Pack salt + iv + ciphertext
  const combined = new Uint8Array(
    salt.length + iv.length + ciphertextBuffer.byteLength
  );
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertextBuffer), salt.length + iv.length);

  return {
    ciphertext: bufferToBase64(combined.buffer),
    iv: '', // packed into ciphertext above
  };
}

// ... decrypt analog
```

**Default-Strategie**: Beim ersten Setup keine Passwort-Pflicht.
Optional in Settings aktivierbar.

## Persistent Storage

iOS kann IndexedDB nach 7+ Tagen Inaktivität löschen. Mitigation:

```typescript
// In App.tsx, beim ersten Start
async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persisted();
    if (!isPersisted) {
      const result = await navigator.storage.persist();
      console.log(`Persistent storage: ${result}`);
    }
  }
}
```

iOS kann diese Anfrage ablehnen — dann brauchen wir den Backup-Mechanismus.

## Backup-Encryption

Beim Daten-Export wird die JSON-Datei mit User-Passwort verschlüsselt
(AES-256-GCM via Web Crypto API). Format:

```json
{
  "version": 1,
  "encrypted": true,
  "salt": "<base64>",
  "iv": "<base64>",
  "ciphertext": "<base64>",
  "checksum": "<sha256-hex of plaintext>"
}
```

Bei Import: Passwort eingeben → entschlüsseln → Checksum prüfen → in DB
schreiben.

## Logging und Privacy

**Was wird geloggt**:
- API-Calls (Modell, Token-Count, Cost)
- Errors mit Stack-Trace
- DB-Migrations
- Watchdog-Tasks

**Was NICHT geloggt wird**:
- Counterparty-Namen (auch nicht anonymisiert)
- Beträge
- Ticker
- API-Keys

**Storage**: Nur lokal in IndexedDB, niemals an externe Services.

## Dependencies-Audit

Vor jedem Major-Release:

```bash
npm audit
npm audit fix

# Manuelle Prüfung:
npx depcheck             # ungenutzte Dependencies
npx npm-check-updates    # outdated Dependencies
```

GitHub Dependabot aktivieren in Repo-Settings.
