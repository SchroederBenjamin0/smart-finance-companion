import { Plus, X } from 'lucide-react';
import type { SuggestedRule } from '@/modules/categorization-memory';

interface Props {
  suggestion: SuggestedRule;
  onAccept: () => void;
  onDismiss: () => void;
}

export function RuleSuggestionPrompt({ suggestion, onAccept, onDismiss }: Props) {
  return (
    <div className="rounded-[16px] border border-forest-200 bg-forest-50 p-3 dark:border-forest-700 dark:bg-forest-900/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-label font-semibold text-forest-900 dark:text-forest-200">
            Künftige <span className="italic">„{suggestion.counterpartyPattern}"</span> auch als <span className="font-bold">{suggestion.category}</span> einordnen?
          </div>
          <div className="mt-1 text-caption text-forest-800/80 dark:text-forest-300/80">
            Erspart dir die manuelle Re-Kategorisierung beim nächsten Mal.
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-forest-800 dark:text-forest-300"
          aria-label="Verwerfen"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="flex items-center gap-1 rounded-full bg-forest-700 px-3 py-1 text-meta font-semibold text-white"
        >
          <Plus className="h-3 w-3" strokeWidth={2.5} />
          Regel speichern
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full bg-surface px-3 py-1 text-meta font-medium text-ink-muted"
        >
          Nicht jetzt
        </button>
      </div>
    </div>
  );
}
