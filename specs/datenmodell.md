# Datenmodell-Spec

## IndexedDB Schema (Version 1)

Wir verwenden die `idb` Library als typisierten Wrapper. Schema-Definition:

```typescript
// src/db/schema.ts
import { DBSchema } from 'idb';

export interface SmartFinanceDB extends DBSchema {
  accounts: {
    key: string;          // UUID
    value: Account;
    indexes: { 'by-type': AccountType };
  };

  incomeEntries: {
    key: string;
    value: IncomeEntry;
    indexes: { 'by-date': string; 'by-source': IncomeSource };
  };

  allocations: {
    key: string;
    value: Allocation;
    indexes: { 'by-income': string; 'by-account': AccountType };
  };

  subscriptions: {
    key: string;
    value: Subscription;
    indexes: { 'by-active': number };
  };

  transactions: {
    key: string;
    value: Transaction;
    indexes: {
      'by-date': string;
      'by-category': string;
      'by-csv': string;
    };
  };

  categoryRules: {
    key: string;
    value: CategoryRule;
    indexes: { 'by-pattern': string };
  };

  csvImports: {
    key: string;
    value: CSVImport;
    indexes: { 'by-date': string };
  };

  investmentPositions: {
    key: string;
    value: InvestmentPosition;
    indexes: { 'by-isin': string };
  };

  recommendations: {
    key: string;
    value: Recommendation;
    indexes: { 'by-date': string; 'by-trigger': RecommendationTrigger };
  };

  newsEvents: {
    key: string;
    value: NewsEvent;
    indexes: {
      'by-ticker': string;
      'by-date': string;
      'by-relevance': NewsRelevance;
    };
  };

  appConfig: {
    key: string;
    value: ConfigEntry;
  };

  secrets: {
    key: string;          // 'anthropic_key' | 'marketaux_key'
    value: SecretEntry;
  };

  appLog: {
    key: number;          // auto-increment
    value: LogEntry;
    indexes: { 'by-timestamp': string; 'by-level': LogLevel };
  };
}
```

## TypeScript-Typen (canonical)

In `src/db/types.ts`:

```typescript
// === Enums ===
export type AccountType = 'fun' | 'savings' | 'investment';
export type IncomeSource = 'main_job' | 'dj_gig' | 'other';
export type IncomeClassification =
  'silent' | 'standard' | 'review' | 'special';
export type AllocationStatus = 'pending' | 'confirmed' | 'cancelled';
export type BillingCycle = 'monthly' | 'yearly';
export type AssetType = 'etf' | 'stock';
export type RecommendationTrigger =
  'monthly' | 'income_event' | 'quarterly';
export type RecommendationStatus =
  'pending' | 'accepted' | 'modified' | 'skipped';
export type NewsRelevance = 'high' | 'medium' | 'low';
export type NewsCategory =
  'earnings' | 'leadership' | 'ma' | 'regulatory' | 'other';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type RuleSource = 'user' | 'ai' | 'system';
export type MatchType = 'exact' | 'regex';

// === Entities ===
export interface Account {
  id: string;
  type: AccountType;
  balance: number;
  goalAmount: number | null;
  lastUpdated: string;        // ISO 8601
}

export interface IncomeEntry {
  id: string;
  date: string;
  amount: number;
  source: IncomeSource;
  note: string | null;
  classification: IncomeClassification;
  createdAt: string;
}

export interface Allocation {
  id: string;
  incomeEntryId: string;
  accountType: AccountType;
  amount: number;
  status: AllocationStatus;
  createdAt: string;
}

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  currency: 'EUR' | 'USD';
  billingCycle: BillingCycle;
  nextBillDate: string;
  endDate: string | null;     // null = unlimited
  category: string;
  isActive: number;           // 0 oder 1 (IndexedDB kann keine bool indexen)
}

export interface Transaction {
  id: string;
  date: string;
  amount: number;             // negativ = Ausgabe, positiv = Einnahme
  counterparty: string;
  description: string | null;
  category: string;
  categoryConfidence: number; // 0.0 bis 1.0
  isUserReviewed: number;     // 0 oder 1
  sourceCsvId: string;
  importedAt: string;
}

export interface CategoryRule {
  id: string;
  counterpartyPattern: string;
  matchType: MatchType;
  category: string;
  createdBy: RuleSource;
  hitCount: number;
  lastUsed: string | null;
  createdAt: string;
}

export interface CSVImport {
  id: string;
  fileName: string;
  importedAt: string;
  transactionCount: number;
  dateRangeStart: string;
  dateRangeEnd: string;
  categorizationCostEur: number;
  anomalies: string[];
}

export interface InvestmentPosition {
  id: string;
  ticker: string;
  isin: string;
  name: string;
  assetType: AssetType;
  totalInvested: number;
  shares: number;
  currentValue: number;
  lastSyncedPrice: string;
}

export interface Recommendation {
  id: string;
  date: string;
  trigger: RecommendationTrigger;
  availableAmount: number;
  suggestionJson: string;     // serialisierter LLM-Output
  rationale: string;
  status: RecommendationStatus;
  userActionAt: string | null;
}

export interface NewsEvent {
  id: string;
  ticker: string;
  headline: string;
  url: string;
  publishedAt: string;
  relevance: NewsRelevance;
  category: NewsCategory;
  summary: string;
  pushedToUser: number;
  userDismissed: number;
  createdAt: string;
}

export interface ConfigEntry {
  key: string;
  value: string;              // JSON-serialisiert
  updatedAt: string;
}

export interface SecretEntry {
  key: string;
  encryptedValue: string;     // Base64 von AES-encrypted
  iv: string;                 // Base64 von Init-Vector
  createdAt: string;
}

export interface LogEntry {
  id?: number;                // auto-increment
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  contextJson: string | null;
}

// === Composite Types ===
export interface Portfolio {
  positions: InvestmentPosition[];
  totalValue: number;
  totalInvested: number;
}

export interface AllocationTarget {
  msciWorld: number;          // Prozent (z.B. 65)
  msciEm: number;
  nasdaq: number;
  cash: number;
}

export interface AllocationRule {
  funPercentage: number;
  savingsPercentage: number;
  investmentPercentage: number;
  savingsCap: number | null;
}

export interface IncomeThresholds {
  silent: number;             // default: 50
  standard: number;           // default: 200
  review: number;             // default: 500
  special: number;            // default: 1000
}
```

## Repository-Pattern

Pro Entity ein Repository in `src/db/repositories/`:

```typescript
// src/db/repositories/accounts.ts
import { getDB } from '../client';
import { Account, AccountType, Result, ok, err } from '../types';

export const accountsRepo = {
  async findAll(): Promise<Result<Account[]>> {
    try {
      const db = await getDB();
      const accounts = await db.getAll('accounts');
      return ok(accounts);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  },

  async findByType(type: AccountType): Promise<Result<Account | null>> {
    try {
      const db = await getDB();
      const accounts = await db.getAllFromIndex(
        'accounts', 'by-type', type
      );
      return ok(accounts[0] ?? null);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  },

  async upsert(account: Account): Promise<Result<void>> {
    try {
      const db = await getDB();
      await db.put('accounts', account);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  },
};
```

## Initial-Daten (Seeds)

Beim Onboarding werden Default-Daten angelegt:

### 3 Konten
```typescript
const initialAccounts: Account[] = [
  {
    id: uuidv4(),
    type: 'fun',
    balance: 0,
    goalAmount: null,
    lastUpdated: new Date().toISOString(),
  },
  {
    id: uuidv4(),
    type: 'savings',
    balance: 0,
    goalAmount: 3300,
    lastUpdated: new Date().toISOString(),
  },
  {
    id: uuidv4(),
    type: 'investment',
    balance: 0,
    goalAmount: null,
    lastUpdated: new Date().toISOString(),
  },
];
```

### Vorgeschlagene Subscriptions (User kann anpassen im Onboarding)
```typescript
const suggestedSubscriptions: Omit<Subscription, 'id'>[] = [
  { name: 'Lexware', amount: 12.90, currency: 'EUR',
    billingCycle: 'monthly', nextBillDate: '...',
    endDate: null, category: 'Buchhaltung', isActive: 1 },
  { name: 'Splice', amount: 13.23, currency: 'EUR',
    billingCycle: 'monthly', nextBillDate: '...',
    endDate: null, category: 'Music-Tools', isActive: 1 },
  { name: 'Splice Serum (Rent-to-Own)', amount: 8.53, currency: 'EUR',
    billingCycle: 'monthly', nextBillDate: '...',
    endDate: '<+4 months>', category: 'Music-Tools', isActive: 1 },
  { name: 'ChatGPT Plus', amount: 9.83, currency: 'EUR',
    billingCycle: 'monthly', nextBillDate: '...',
    endDate: null, category: 'AI-Tools', isActive: 1 },
  { name: 'SoundCloud', amount: 4.99, currency: 'EUR',
    billingCycle: 'monthly', nextBillDate: '...',
    endDate: null, category: 'Music-Hosting', isActive: 1 },
  { name: 'Snapchat+', amount: 3.99, currency: 'EUR',
    billingCycle: 'monthly', nextBillDate: '...',
    endDate: null, category: 'Social', isActive: 1 },
];
```

### Bekannte Counterparties (Initial Category Rules)
```typescript
const initialRules: Omit<CategoryRule, 'id' | 'createdAt'>[] = [
  { counterpartyPattern: 'LEXWARE', matchType: 'regex',
    category: 'software-abos', createdBy: 'system',
    hitCount: 0, lastUsed: null },
  { counterpartyPattern: 'SPLICE', matchType: 'regex',
    category: 'musik-tools', createdBy: 'system',
    hitCount: 0, lastUsed: null },
  { counterpartyPattern: 'OPENAI', matchType: 'regex',
    category: 'software-abos', createdBy: 'system',
    hitCount: 0, lastUsed: null },
  { counterpartyPattern: 'SOUNDCLOUD', matchType: 'regex',
    category: 'musik-tools', createdBy: 'system',
    hitCount: 0, lastUsed: null },
  { counterpartyPattern: 'SNAPCHAT', matchType: 'regex',
    category: 'freizeit', createdBy: 'system',
    hitCount: 0, lastUsed: null },
  { counterpartyPattern: '^(REWE|EDEKA|ALDI|LIDL|KAUFLAND|NETTO|PENNY|DM|ROSSMANN)',
    matchType: 'regex',
    category: 'lebensmittel', createdBy: 'system',
    hitCount: 0, lastUsed: null },
  { counterpartyPattern: '^(SHELL|ARAL|ESSO|TOTAL|JET|HEM)',
    matchType: 'regex',
    category: 'transport', createdBy: 'system',
    hitCount: 0, lastUsed: null },
];
```

## Migrations

```typescript
// src/db/migrations.ts
import { IDBPDatabase, openDB } from 'idb';
import type { SmartFinanceDB } from './schema';

export async function getDB(): Promise<IDBPDatabase<SmartFinanceDB>> {
  return openDB<SmartFinanceDB>('smart-finance', 1, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        // Initial schema
        const accounts = db.createObjectStore('accounts', {
          keyPath: 'id'
        });
        accounts.createIndex('by-type', 'type', { unique: true });

        const income = db.createObjectStore('incomeEntries', {
          keyPath: 'id'
        });
        income.createIndex('by-date', 'date');
        income.createIndex('by-source', 'source');

        // ... weitere Stores siehe schema.ts
      }
    },
  });
}
```

## Datenmodell-Beziehungen (Diagramm-Beschreibung)

- `Account` (3 Records, immer): Fun, Savings, Investment
- `IncomeEntry` (1) → `Allocation` (n): jeder Income wird auf 3 Konten verteilt
- `Subscription` (n): unabhängig, aber im Insights als Ausgaben-Kategorie sichtbar
- `CSVImport` (1) → `Transaction` (n): jeder Import bringt n Transaktionen
- `CategoryRule` (n): wird vom Categorizer konsumiert + erweitert
- `InvestmentPosition` (n): manuell erfasst, aktualisiert via Yahoo
- `Recommendation` (n): Output des Advisors, History
- `NewsEvent` (n): vom Watchdog gefiltert, History
- `Secret` (max 2): Anthropic-Key, Marketaux-Key
- `AppConfig` (Key-Value): Allocation-Rules, Thresholds, Last-Run-Times
