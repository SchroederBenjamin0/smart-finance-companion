import { getDB } from '@/db/client';
import { ok, err, type Result } from '@/lib/result';
import { ALL_CONFIG_KEYS } from '@/db/types';
import type {
  Account,
  Allocation,
  CategoryRule,
  ConfigEntry,
  IncomeEntry,
  InvestmentPosition,
  Loan,
  Recommendation,
  Subscription,
  Transaction,
} from '@/db/types';

export const BACKUP_VERSION = 1;

export interface BackupData {
  transactions: Transaction[];
  accounts: Account[];
  allocations: Allocation[];
  incomeEntries: IncomeEntry[];
  subscriptions: Subscription[];
  categoryRules: CategoryRule[];
  investmentPositions: InvestmentPosition[];
  loans: Loan[];
  recommendations: Recommendation[];
  appConfig: ConfigEntry[];
}

export interface BackupBlob {
  version: 1;
  exportedAt: string;
  data: BackupData;
}

export function backupBlobFromData(data: BackupData, now: Date): BackupBlob {
  return { version: BACKUP_VERSION, exportedAt: now.toISOString(), data };
}

export async function buildBackup(): Promise<Result<BackupBlob>> {
  try {
    const db = await getDB();
    const [
      transactions,
      accounts,
      allocations,
      incomeEntries,
      subscriptions,
      categoryRules,
      investmentPositions,
      loans,
      recommendations,
      appConfig,
    ] = await Promise.all([
      db.getAll('transactions'),
      db.getAll('accounts'),
      db.getAll('allocations'),
      db.getAll('incomeEntries'),
      db.getAll('subscriptions'),
      db.getAll('categoryRules'),
      db.getAll('investmentPositions'),
      db.getAll('loans'),
      db.getAll('recommendations'),
      db.getAll('appConfig'),
    ]);
    return ok(
      backupBlobFromData(
        {
          transactions,
          accounts,
          allocations,
          incomeEntries,
          subscriptions,
          categoryRules,
          investmentPositions,
          loans,
          recommendations,
          appConfig,
        },
        new Date(),
      ),
    );
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export async function exportBackup(): Promise<Result<void>> {
  const r = await buildBackup();
  if (!r.ok) return err(r.error);
  const json = JSON.stringify(r.value, null, 2);
  const fileName = `smart-finance-backup-${new Date().toISOString().slice(0, 10)}.json`;

  try {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      const file = new File([json], fileName, { type: 'application/json' });
      try {
        await navigator.share({ files: [file], title: 'Smart Finance Backup' });
      } catch {
        // Fallback: User may have cancelled or file-share not supported
        downloadJson(json, fileName);
      }
    } else {
      downloadJson(json, fileName);
    }
    const db = await getDB();
    await db.put('appConfig', {
      key: ALL_CONFIG_KEYS.lastBackup,
      value: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

function downloadJson(json: string, fileName: string): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const REQUIRED_KEYS: (keyof BackupData)[] = [
  'transactions',
  'accounts',
  'allocations',
  'incomeEntries',
  'subscriptions',
  'categoryRules',
  'investmentPositions',
  'loans',
  'recommendations',
  'appConfig',
];

export function validateBackupShape(
  input: unknown,
): { ok: true; blob: BackupBlob } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Not an object' };
  const blob = input as Record<string, unknown>;
  if (blob.version !== 1) return { ok: false, error: `Unsupported version: ${blob.version}` };
  if (typeof blob.exportedAt !== 'string') return { ok: false, error: 'Missing exportedAt' };
  if (!blob.data || typeof blob.data !== 'object') return { ok: false, error: 'Missing data' };
  const data = blob.data as Record<string, unknown>;
  for (const k of REQUIRED_KEYS) {
    if (!Array.isArray(data[k])) return { ok: false, error: `Missing or invalid: data.${k}` };
  }
  return { ok: true, blob: input as BackupBlob };
}

export async function restoreBackup(blob: BackupBlob): Promise<Result<void>> {
  try {
    const db = await getDB();
    const tx = db.transaction(
      [
        'transactions',
        'accounts',
        'allocations',
        'incomeEntries',
        'subscriptions',
        'categoryRules',
        'investmentPositions',
        'loans',
        'recommendations',
        'appConfig',
      ],
      'readwrite',
    );
    for (const key of REQUIRED_KEYS) {
      const store = tx.objectStore(key);
      await store.clear();
      for (const row of blob.data[key]) {
        await store.put(row as never);
      }
    }
    await tx.done;
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
