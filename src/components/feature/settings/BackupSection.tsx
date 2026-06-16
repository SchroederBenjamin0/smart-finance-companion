import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Download, Upload } from 'lucide-react';
import {
  buildBackup,
  exportBackup,
  restoreBackup,
  validateBackupShape,
  type BackupBlob,
} from '@/modules/backup';

interface RestoreStats {
  current: { transactions: number; loans: number; subscriptions: number };
  backup: { transactions: number; loans: number; subscriptions: number };
}

export function BackupSection() {
  const [pendingRestore, setPendingRestore] = useState<BackupBlob | null>(null);
  const [stats, setStats] = useState<RestoreStats | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setError(null);
    setBusy(true);
    const r = await exportBackup();
    setBusy(false);
    if (!r.ok) setError(r.error.message);
  };

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const valid = validateBackupShape(parsed);
      if (!valid.ok) {
        setError(valid.error);
        return;
      }
      const current = await buildBackup();
      if (!current.ok) {
        setError(current.error.message);
        return;
      }
      setStats({
        current: {
          transactions: current.value.data.transactions.length,
          loans: current.value.data.loans.length,
          subscriptions: current.value.data.subscriptions.length,
        },
        backup: {
          transactions: valid.blob.data.transactions.length,
          loans: valid.blob.data.loans.length,
          subscriptions: valid.blob.data.subscriptions.length,
        },
      });
      setPendingRestore(valid.blob);
      setConfirmText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleConfirm = async () => {
    if (!pendingRestore || confirmText !== 'REPLACE') return;
    setBusy(true);
    const r = await restoreBackup(pendingRestore);
    setBusy(false);
    if (r.ok) {
      window.location.reload();
    } else {
      setError(r.error.message);
      setPendingRestore(null);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setPendingRestore(null);
      setConfirmText('');
      setStats(null);
    }
  };

  return (
    <>
      <div className="mt-5">
        <h2 className="mb-2 ml-1 text-meta font-semibold uppercase tracking-wider text-ink-subtle">
          Backup
        </h2>
        <div className="card row-divider overflow-hidden p-0">
          {/* Export row */}
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={busy}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-paper disabled:opacity-50"
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200">
              <Download className="h-4.5 w-4.5" strokeWidth={2.25} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-body font-semibold text-ink">Backup exportieren</div>
              <div className="text-meta text-ink-subtle">
                {busy ? 'Exportiere…' : 'Alle Daten als JSON sichern'}
              </div>
            </div>
          </button>

          {/* Import row */}
          <label className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 transition active:bg-paper">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200">
              <Upload className="h-4.5 w-4.5" strokeWidth={2.25} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-body font-semibold text-ink">Backup importieren</div>
              <div className="text-meta text-ink-subtle">JSON-Backup-Datei auswählen</div>
            </div>
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {error && (
          <div className="mt-2 rounded-chip border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Restore confirm modal */}
      <Dialog.Root open={pendingRestore !== null} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
          <Dialog.Content
            className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[28px] bg-paper p-5 shadow-nav outline-none"
            aria-describedby={undefined}
          >
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-forest-950/15" />

            <Dialog.Title className="text-heading font-semibold text-red-800">
              Warnung: Daten werden ersetzt
            </Dialog.Title>

            <p className="mt-2 text-body text-ink">
              Restore überschreibt ALLE aktuellen Daten:
            </p>

            {stats && (
              <ul className="mt-2 space-y-1 rounded-chip border border-forest-950/10 bg-surface px-3 py-2 text-label text-ink-muted">
                <li className="flex items-center justify-between">
                  <span>Transaktionen</span>
                  <span className="tabular-nums">
                    <span className="text-ink-subtle">{stats.current.transactions} aktuell</span>
                    {' → '}
                    <span className="font-medium text-ink">{stats.backup.transactions} im Backup</span>
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Verleih-Einträge</span>
                  <span className="tabular-nums">
                    <span className="text-ink-subtle">{stats.current.loans} aktuell</span>
                    {' → '}
                    <span className="font-medium text-ink">{stats.backup.loans} im Backup</span>
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Abos</span>
                  <span className="tabular-nums">
                    <span className="text-ink-subtle">{stats.current.subscriptions} aktuell</span>
                    {' → '}
                    <span className="font-medium text-ink">{stats.backup.subscriptions} im Backup</span>
                  </span>
                </li>
              </ul>
            )}

            <p className="mt-3 text-label text-ink-subtle">
              Diese Aktion ist <strong>nicht rückgängig</strong> zu machen. API-Keys bleiben
              unverändert und müssen nicht neu eingegeben werden.
            </p>

            <p className="mt-3 text-body font-medium text-ink">
              Um zu bestätigen, tippe{' '}
              <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-red-700 shadow-card">
                REPLACE
              </code>{' '}
              ein:
            </p>

            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="input-field mt-2"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="REPLACE"
            />

            <div
              className="mt-4 flex gap-2"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 4px)' }}
            >
              <button
                type="button"
                onClick={() => setPendingRestore(null)}
                className="flex-1 rounded-full border border-forest-950/15 bg-surface px-4 py-2 text-body font-medium text-ink"
                disabled={busy}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={confirmText !== 'REPLACE' || busy}
                className="flex-1 rounded-full bg-red-700 px-4 py-2 text-body font-semibold text-white disabled:opacity-40"
              >
                {busy ? 'Importiere…' : 'Backup importieren'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
