import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
} from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { csvImportsRepo } from '@/db/repositories/csvImports';
import { transactionsRepo } from '@/db/repositories/transactions';
import { getDB } from '@/db/client';
import type { CSVImport, Transaction } from '@/db/types';
import { formatEur } from '@/lib/currency';
import { generateId } from '@/lib/id';
import { formatDateDe, nowIso } from '@/lib/date';
import {
  categorize,
  VALID_CATEGORIES,
  type CategorizationOutput,
} from '@/modules/categorizer';
import { detectAnomalies, type AnomalyResult } from '@/modules/anomaly';
import { notifyAnomalies } from '@/modules/notifications';
import {
  parseRevolutCsv,
  type RevolutTxn,
} from '@/services/revolutCsvImport';
import { useToastStore } from '@/stores/toast';
import { AnomalyBanner } from './AnomalyBanner';

type Stage = 'pick' | 'parsing' | 'review' | 'saving' | 'done';

interface ImportSummary {
  inserted: number;
  skipped: number;
}

interface DraftRow {
  txn: RevolutTxn;
  category: string;
  confidence: number;
  source: CategorizationOutput['source'];
  warning: string | null;
  enabled: boolean;
  isDuplicate: boolean;
  duplicateReason?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingTransactions: Transaction[];
  onImported: () => void;
}

export function CsvImportSheet({
  open,
  onOpenChange,
  existingTransactions,
  onImported,
}: Props) {
  const [stage, setStage] = useState<Stage>('pick');
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [periodLabel, setPeriodLabel] = useState('');
  const [fileName, setFileName] = useState('');
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyResult[]>([]);
  const pushToast = useToastStore((s) => s.push);

  function reset() {
    setStage('pick');
    setError(null);
    setDrafts([]);
    setPeriodLabel('');
    setFileName('');
    setImportSummary(null);
    setAnomalies([]);
  }

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStage('parsing');
    setError(null);

    const parseR = await parseRevolutCsv(file);
    if (!parseR.ok) {
      setError(`Parse fehlgeschlagen: ${parseR.error.message}`);
      setStage('pick');
      return;
    }
    const { transactions, periodStart, periodEnd } = parseR.value;
    if (transactions.length === 0) {
      setError(
        'Keine Transaktionen erkannt. Achte darauf dass die Datei eine Revolut-CSV ist.',
      );
      setStage('pick');
      return;
    }
    setPeriodLabel(`${formatDateDe(periodStart)} – ${formatDateDe(periodEnd)}`);

    // Categorize via 3-stage cascade.
    const catR = await categorize(
      transactions.map((t, i) => ({
        localId: i,
        date: t.date,
        counterparty: t.description,
        description: null,
        amount: t.amount,
      })),
    );
    const cats = catR.ok ? catR.value : [];
    if (!catR.ok) {
      pushToast(`AI-Categorizer Fehler: ${catR.error.message}`, 'error');
    }

    const newDrafts: DraftRow[] = transactions.map((txn, i) => {
      const cat = cats.find((c) => c.localId === i);
      const dup = findDuplicate(txn, existingTransactions);
      return {
        txn,
        category: cat?.category ?? 'sonstiges',
        confidence: cat?.confidence ?? 0.4,
        source: cat?.source ?? 'fallback',
        warning: cat?.warning ?? null,
        enabled: !dup,
        isDuplicate: !!dup,
        duplicateReason: dup?.reason,
      };
    });
    setDrafts(newDrafts);
    setStage('review');
  }

  const enabledCount = drafts.filter((d) => d.enabled).length;
  const duplicateCount = drafts.filter((d) => d.isDuplicate).length;

  async function importAll() {
    setStage('saving');
    const ts = nowIso();
    const csvImportId = generateId();
    const enabled = drafts.filter((d) => d.enabled);

    const transactions: Omit<Transaction, 'transactionHash' | 'isAnomaly'>[] = enabled.map((d) => ({
      id: generateId(),
      date: d.txn.date,
      amount: d.txn.amount,
      counterparty: d.txn.description,
      description: null,
      category: d.category,
      categoryConfidence: d.confidence,
      isUserReviewed: 1,
      sourceCsvId: csvImportId,
      importedAt: ts,
    }));

    const dates = enabled.map((d) => d.txn.date).sort();
    const csvRecord: Omit<CSVImport, 'expiresAt' | 'transactionCount'> = {
      id: csvImportId,
      fileName,
      importedAt: ts,
      dateRangeStart: dates[0] ?? '',
      dateRangeEnd: dates[dates.length - 1] ?? '',
      categorizationCostEur: 0,
      anomalies: drafts.filter((d) => d.warning).map((d) => d.warning!),
    };

    const r = await csvImportsRepo.createWithTransactions(csvRecord, transactions);
    if (!r.ok) {
      pushToast(`Speichern fehlgeschlagen: ${r.error.message}`, 'error');
      setStage('review');
      return;
    }
    const { inserted, skipped } = r.value;
    const msg = skipped > 0
      ? `${inserted} neue Transaktionen importiert, ${skipped} Duplikate übersprungen`
      : `${inserted} Transaktionen importiert`;
    pushToast(msg, 'success');
    setImportSummary({ inserted, skipped });
    onImported();

    // Run anomaly detection on the just-imported transactions.
    const allR = await transactionsRepo.findRecent(5000);
    if (allR.ok) {
      const justInserted = allR.value.filter((t) => t.sourceCsvId === csvImportId);
      const historical = allR.value.filter((t) => t.sourceCsvId !== csvImportId);
      const detected = detectAnomalies(justInserted, historical);
      if (detected.length > 0) {
        const db = await getDB();
        const dbTx = db.transaction('transactions', 'readwrite');
        const store = dbTx.objectStore('transactions');
        const anomalyIds = new Set(detected.map((a) => a.txId));
        for (const t of justInserted) {
          if (anomalyIds.has(t.id)) {
            await store.put({ ...t, isAnomaly: 1 });
          }
        }
        await dbTx.done;
        setAnomalies(detected);
        await notifyAnomalies(csvImportId, detected.length);
      }
    }

    setStage('done');
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Revolut CSV-Import"
      footer={
        stage === 'review' ? (
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => void importAll()}
            disabled={enabledCount === 0}
          >
            {enabledCount} Transaktion{enabledCount === 1 ? '' : 'en'} importieren
          </button>
        ) : undefined
      }
    >
      {stage === 'pick' && (
        <div className="space-y-4 pt-2">
          <p className="text-sm text-ink-muted">
            Lade dein Revolut „Consolidated Statement" hoch (CSV). Die App
            erkennt alle Buchungen, kategorisiert sie via Claude und gleicht
            sie mit deinen manuellen Einträgen ab. Du kannst alles vor dem
            Speichern noch prüfen.
          </p>
          <label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-forest-950/20 bg-surface text-ink-muted transition active:scale-[0.99]">
            <Upload className="h-6 w-6" strokeWidth={2.25} />
            <span className="text-sm font-medium">CSV auswählen</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFile}
            />
          </label>
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      )}

      {stage === 'parsing' && (
        <div className="flex h-56 flex-col items-center justify-center gap-3 text-ink-muted">
          <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2.25} />
          <p className="text-sm">CSV wird geparst und kategorisiert…</p>
          <p className="text-[12px] text-ink-subtle">
            Claude klassifiziert deine Buchungen in Kategorien.
          </p>
        </div>
      )}

      {stage === 'saving' && (
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-ink-muted">
          <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2.25} />
          <p className="text-sm">Speichere…</p>
        </div>
      )}

      {stage === 'done' && (
        <div className="space-y-4 pt-2">
          <AnomalyBanner anomalies={anomalies} onDismiss={() => setAnomalies([])} />
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-8 w-8" strokeWidth={2} />
            <p className="text-sm font-medium">Import abgeschlossen</p>
            {importSummary && (
              <p className="text-[12px] text-ink-muted text-center">
                {importSummary.inserted} Transaktion{importSummary.inserted === 1 ? '' : 'en'} importiert
                {importSummary.skipped > 0 && (
                  <> · {importSummary.skipped} Duplikat{importSummary.skipped === 1 ? '' : 'e'} übersprungen</>
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {stage === 'review' && (
        <div className="space-y-3 pb-2">
          <div className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2 text-[12px] text-ink-muted">
            <FileText className="h-4 w-4 shrink-0" strokeWidth={2.25} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-ink">{fileName}</div>
              <div className="truncate">
                {periodLabel} · {drafts.length} Buchungen
                {duplicateCount > 0 && (
                  <> · {duplicateCount} Duplikat(e) erkannt</>
                )}
              </div>
            </div>
          </div>
          <p className="text-[12px] text-ink-subtle">
            Duplikate (in Datum + Betrag deckend mit manuellem Eintrag) sind
            standardmäßig ausgehakt. Kategorien sind editierbar.
          </p>

          {drafts.map((d, i) => (
            <ReviewRow
              key={`${d.txn.date}-${d.txn.amount}-${i}`}
              draft={d}
              onChange={(patch) =>
                setDrafts((arr) =>
                  arr.map((x, idx) =>
                    idx === i ? { ...x, ...patch } : x,
                  ),
                )
              }
            />
          ))}
        </div>
      )}
    </Sheet>
  );
}

function ReviewRow({
  draft,
  onChange,
}: {
  draft: DraftRow;
  onChange: (patch: Partial<DraftRow>) => void;
}) {
  const isExpense = draft.txn.amount < 0;
  return (
    <div
      className={`rounded-2xl border p-3 ${
        draft.isDuplicate
          ? 'border-amber-200 bg-amber-50/30'
          : 'border-forest-950/10 bg-surface'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="mt-1 h-4 w-4 accent-forest-950"
          aria-label={`${draft.txn.description} importieren`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="truncate text-[14px] font-semibold text-ink">
              {draft.txn.description || '(kein Name)'}
            </div>
            <div
              className={`shrink-0 text-[14px] font-semibold tabular-nums ${
                isExpense ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {isExpense ? '−' : '+'}
              {formatEur(Math.abs(draft.txn.amount))}
            </div>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-subtle">
            <span>{formatDateDe(draft.txn.date)}</span>
            <span>·</span>
            <span>{draft.txn.account === 'savings' ? 'Sparkonto' : 'Konto'}</span>
            {draft.source === 'lookup' && (
              <span className="rounded-full bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200 px-1.5 py-0.5 text-[10px] font-bold">
                Regel
              </span>
            )}
            {draft.source === 'llm' && (
              <span className="rounded-full bg-mint-200 px-1.5 py-0.5 text-[10px] font-bold text-forest-800">
                AI {Math.round(draft.confidence * 100)}%
              </span>
            )}
            {draft.source === 'fallback' && (
              <span className="rounded-full bg-paper px-1.5 py-0.5 text-[10px] text-ink-subtle">
                unsicher
              </span>
            )}
            {draft.isDuplicate && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
                Duplikat
              </span>
            )}
          </div>
          {draft.warning && (
            <div className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              {draft.warning}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <select
              value={draft.category}
              onChange={(e) => onChange({ category: e.target.value })}
              className="h-9 flex-1 rounded-xl border border-forest-950/10 bg-surface px-2 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-forest-700"
            >
              {VALID_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

const RECONCILE_DAYS = 3;
const AMOUNT_TOLERANCE = 0.01;

interface DuplicateMatch {
  reason: string;
}

function findDuplicate(
  csvTxn: RevolutTxn,
  existing: Transaction[],
): DuplicateMatch | null {
  for (const e of existing) {
    if (e.sourceCsvId !== 'manual') continue;
    if (Math.sign(e.amount) !== Math.sign(csvTxn.amount)) continue;
    if (Math.abs(Math.abs(e.amount) - Math.abs(csvTxn.amount)) > AMOUNT_TOLERANCE) continue;
    if (Math.abs(daysBetween(e.date, csvTxn.date)) > RECONCILE_DAYS) continue;
    return { reason: `Manueller Eintrag am ${formatDateDe(e.date)}` };
  }
  return null;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return (db - da) / (1000 * 60 * 60 * 24);
}

