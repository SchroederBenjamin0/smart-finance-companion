import type { DBSchema } from 'idb';
import type {
  Account,
  AccountType,
  Allocation,
  CSVImport,
  CategoryRule,
  ConfigEntry,
  IncomeEntry,
  IncomeSource,
  InvestmentPosition,
  Loan,
  LoanStatus,
  LogEntry,
  LogLevel,
  NewsEvent,
  NewsRelevance,
  NotificationLogEntry,
  NotificationTrigger,
  PriceCacheEntry,
  Recommendation,
  RecommendationTrigger,
  SecretEntry,
  Subscription,
  Transaction,
} from './types';

export const DB_NAME = 'smart-finance';
export const DB_VERSION = 4;

export interface SmartFinanceDB extends DBSchema {
  accounts: {
    key: string;
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
      'by-hash': string;
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
    indexes: { 'by-date': string; 'by-expires': string };
  };
  investmentPositions: {
    key: string;
    value: InvestmentPosition;
    indexes: { 'by-isin': string };
  };
  loans: {
    key: string;
    value: Loan;
    indexes: { 'by-status': LoanStatus; 'by-lentAt': string };
  };
  recommendations: {
    key: string;
    value: Recommendation;
    indexes: {
      'by-date': string;
      'by-trigger': RecommendationTrigger;
    };
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
  priceCache: {
    key: string;
    value: PriceCacheEntry;
    indexes: { 'by-fetchedAt': string };
  };
  notificationLog: {
    key: string;
    value: NotificationLogEntry;
    indexes: {
      'by-dedupeKey': string;
      'by-firedAt': string;
      'by-type': NotificationTrigger;
    };
  };
  appConfig: {
    key: string;
    value: ConfigEntry;
  };
  secrets: {
    key: string;
    value: SecretEntry;
  };
  appLog: {
    key: number;
    value: LogEntry;
    indexes: { 'by-timestamp': string; 'by-level': LogLevel };
  };
}
