import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { recategorizeWithLLM } from '@/modules/categorizer';
import { getDB } from '@/db/client';
import type { Transaction } from '@/db/types';

interface Props {
  category: string | null;
  transactions: Transaction[];
  onClose: () => void;
  onRecategorized: () => void;
}

export function CategoryDrilldownSheet({ category, transactions, onClose, onRecategorized }: Props) {
  const [running, setRunning] = useState(false);

  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  const lowConfidence = sorted.filter((t) => t.categoryConfidence < 0.7);

  const handleRecheck = async () => {
    if (lowConfidence.length === 0) return;
    setRunning(true);
    try {
      const inputs = lowConfidence.map((t, idx) => ({
        localId: idx,
        date: t.date,
        counterparty: t.counterparty,
        description: t.description,
        amount: t.amount,
      }));
      const r = await recategorizeWithLLM(inputs);
      if (r.ok) {
        const db = await getDB();
        const tx = db.transaction('transactions', 'readwrite');
        const store = tx.objectStore('transactions');
        await Promise.all(
          r.value.map(async (out) => {
            const original = lowConfidence[out.localId];
            if (!original) return;
            const updated: Transaction = {
              ...original,
              category: out.category,
              categoryConfidence: out.confidence,
            };
            await store.put(updated);
          }),
        );
        await tx.done;
        onRecategorized();
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog.Root open={category !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-[18px] font-semibold capitalize text-ink">
              {category}
            </Dialog.Title>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-paper px-3 py-1 text-[13px] text-ink-muted"
            >
              Schließen
            </button>
          </div>

          {lowConfidence.length > 0 && (
            <button
              type="button"
              onClick={() => void handleRecheck()}
              disabled={running}
              className="mt-3 rounded-full bg-forest-700 px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {running ? 'Prüfe...' : `Mit LLM neu prüfen (${lowConfidence.length} unsicher)`}
            </button>
          )}

          <ul className="mt-4 row-divider overflow-hidden rounded-[16px] bg-paper">
            {sorted.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-ink">{t.counterparty}</div>
                  <div className="truncate text-[12px] text-ink-subtle">
                    {t.date}
                    {t.categoryConfidence < 0.7 && ' · ⚠️ unsicher'}
                  </div>
                </div>
                <div className="text-[14px] tabular-nums text-ink">
                  {Math.abs(t.amount).toFixed(2)} €
                </div>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
