import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { recategorizeWithLLM } from '@/modules/categorizer';
import { suggestRuleFromChange, type SuggestedRule } from '@/modules/categorization-memory';
import { getDB } from '@/db/client';
import { categoryRulesRepo } from '@/db/repositories/categoryRules';
import type { Transaction } from '@/db/types';
import { RuleSuggestionPrompt } from '@/components/feature/categorization/RuleSuggestionPrompt';
import { generateId } from '@/lib/id';
import { nowIso } from '@/lib/date';

interface Props {
  category: string | null;
  transactions: Transaction[];
  onClose: () => void;
  onRecategorized: () => void;
}

export function CategoryDrilldownSheet({ category, transactions, onClose, onRecategorized }: Props) {
  const [running, setRunning] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedRule[]>([]);

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
        const rulesR = await categoryRulesRepo.findAll();
        const existingRules = rulesR.ok ? rulesR.value : [];

        const newSuggestions = new Map<string, SuggestedRule>();
        const db = await getDB();
        const tx = db.transaction('transactions', 'readwrite');
        const store = tx.objectStore('transactions');

        for (const out of r.value) {
          const original = lowConfidence[out.localId];
          if (!original) continue;
          if (out.category !== original.category) {
            const s = suggestRuleFromChange({
              counterparty: original.counterparty,
              oldCategory: original.category,
              newCategory: out.category,
              existingRules,
            });
            if (s) newSuggestions.set(`${s.counterpartyPattern}|${s.category}`, s);
          }
          const updated: Transaction = {
            ...original,
            category: out.category,
            categoryConfidence: out.confidence,
          };
          await store.put(updated);
        }
        await tx.done;
        setSuggestions(Array.from(newSuggestions.values()));
        onRecategorized();
      }
    } finally {
      setRunning(false);
    }
  };

  const acceptSuggestion = async (sug: SuggestedRule) => {
    await categoryRulesRepo.upsert({
      id: generateId(),
      counterpartyPattern: sug.counterpartyPattern,
      matchType: sug.matchType,
      category: sug.category,
      createdBy: 'user',
      hitCount: 0,
      lastUsed: null,
      createdAt: nowIso(),
    });
    setSuggestions((prev) => prev.filter((s) => s !== sug));
  };

  const dismissSuggestion = (sug: SuggestedRule) => {
    setSuggestions((prev) => prev.filter((s) => s !== sug));
  };

  return (
    <Dialog.Root
      open={category !== null}
      onOpenChange={(o) => {
        if (!o) {
          setSuggestions([]);
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[28px] bg-surface p-5 shadow-2xl outline-none"
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

          {suggestions.length > 0 && (
            <div className="mb-3 mt-3 space-y-2">
              {suggestions.map((s) => (
                <RuleSuggestionPrompt
                  key={`${s.counterpartyPattern}|${s.category}`}
                  suggestion={s}
                  onAccept={() => void acceptSuggestion(s)}
                  onDismiss={() => dismissSuggestion(s)}
                />
              ))}
            </div>
          )}

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
                    {t.categoryConfidence < 0.7 && (
                      <span className="inline-flex items-center gap-1"> · <AlertTriangle className="h-3 w-3" strokeWidth={2.5} /> unsicher</span>
                    )}
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
