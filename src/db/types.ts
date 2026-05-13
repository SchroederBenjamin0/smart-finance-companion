export type AccountType = 'fun' | 'savings' | 'investment';
export type IncomeSource = 'main_job' | 'dj_gig' | 'other';
export type IncomeClassification =
  | 'silent'
  | 'standard'
  | 'review'
  | 'special';
export type AllocationStatus = 'pending' | 'confirmed' | 'cancelled';
export type BillingCycle = 'monthly' | 'yearly';
export type AssetType = 'etf' | 'stock';
export type RecommendationTrigger =
  | 'monthly'
  | 'income_event'
  | 'quarterly';
export type RecommendationStatus =
  | 'pending'
  | 'accepted'
  | 'modified'
  | 'skipped';
export type NewsRelevance = 'high' | 'medium' | 'low';
export type NewsCategory =
  | 'earnings'
  | 'leadership'
  | 'ma'
  | 'regulatory'
  | 'other';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type RuleSource = 'user' | 'ai' | 'system';
export type MatchType = 'exact' | 'regex';
export type SecretKey = 'anthropic_key' | 'marketaux_key';
export type LoanStatus = 'lent' | 'returned';
export type LoanPaymentMethod = 'cash' | 'transfer';

export interface Account {
  id: string;
  type: AccountType;
  balance: number;
  goalAmount: number | null;
  lastUpdated: string;
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
  /**
   * Date of the most recent successful debit. Optional — older records may
   * not have this set. When present, `nextBillDate` is derived from it.
   */
  lastBilledDate?: string | null;
  nextBillDate: string;
  endDate: string | null;
  category: string;
  isActive: number;
}

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  counterparty: string;
  description: string | null;
  category: string;
  categoryConfidence: number;
  isUserReviewed: number;
  sourceCsvId: string;
  importedAt: string;
  transactionHash: string;   // SHA-256(date|cents|counterparty)
  isAnomaly: number;         // 0 / 1, gesetzt beim Import (default 0)
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
  expiresAt: string;         // importedAt + 30 Tage, ISO
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
  /** Target weight in the portfolio (0-100). 0 means "no target set". */
  targetPercentage: number;
}

export interface Recommendation {
  id: string;
  date: string;
  trigger: RecommendationTrigger;
  availableAmount: number;
  suggestionJson: string;
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
  value: string;
  updatedAt: string;
}

export interface SecretEntry {
  key: SecretKey;
  encryptedValue: string;
  iv: string;
  createdAt: string;
}

export interface LogEntry {
  id?: number;
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  contextJson: string | null;
}

export interface Loan {
  id: string;
  borrowerName: string;
  itemDescription: string;
  lentAt: string;          // ISO date
  amount?: number;
  paymentMethod?: LoanPaymentMethod;
  status: LoanStatus;
  returnedAt?: string;
  createdAt: string;
}

export interface PriceCachePoint {
  date: string; // ISO YYYY-MM-DD (first of month)
  close: number;
}

export interface PriceCacheEntry {
  ticker: string;
  monthlyCloses: PriceCachePoint[];
  fetchedAt: string;
}

export interface Portfolio {
  positions: InvestmentPosition[];
  totalValue: number;
  totalInvested: number;
}

export interface AllocationTarget {
  msciWorld: number;
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
  silent: number;
  standard: number;
  review: number;
  special: number;
}

export const DEFAULT_INCOME_THRESHOLDS: IncomeThresholds = {
  silent: 50,
  standard: 200,
  review: 500,
  special: 1000,
};

export const DEFAULT_MAIN_JOB_RULE: AllocationRule = {
  funPercentage: 30,
  savingsPercentage: 25,
  investmentPercentage: 45,
  savingsCap: 3300,
};

export const DEFAULT_DJ_RULE: AllocationRule = {
  funPercentage: 20,
  savingsPercentage: 20,
  investmentPercentage: 60,
  savingsCap: 3300,
};

export const DEFAULT_OTHER_RULE: AllocationRule = {
  funPercentage: 30,
  savingsPercentage: 30,
  investmentPercentage: 40,
  savingsCap: 3300,
};

export const DEFAULT_ALLOCATION_TARGET: AllocationTarget = {
  msciWorld: 65,
  msciEm: 15,
  nasdaq: 10,
  cash: 10,
};

export const ALL_CONFIG_KEYS = {
  rules: 'allocation_rules',
  thresholds: 'income_thresholds',
  emergencyFundTarget: 'emergency_fund_target',
  allocationTarget: 'allocation_target',
  lastWatchdogRun: 'last_watchdog_run',
  lastBackup: 'last_backup',
  appPinHash: 'app_pin_hash',
  onboardingComplete: 'onboarding_complete',
  themeOverride: 'theme_override',
  driftToleranceGlobal: 'drift_tolerance_global',
  hashBackfillComplete: 'hash_backfill_complete',
  cashflowFunWarnThreshold: 'cashflow_fun_warn_threshold',
} as const;
