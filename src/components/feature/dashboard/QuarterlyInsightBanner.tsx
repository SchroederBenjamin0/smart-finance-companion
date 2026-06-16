import { useEffect, useState } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { recommendationsRepo } from '@/db/repositories/recommendations';
import type { Recommendation } from '@/db/types';
import { formatDateDe } from '@/lib/date';

export function QuarterlyInsightBanner() {
  const [latest, setLatest] = useState<Recommendation | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await recommendationsRepo.findByTrigger('quarterly', 1);
      if (r.ok && r.value[0]) setLatest(r.value[0]);
    })();
  }, []);

  if (!latest) return null;

  let markdown = '';
  try {
    const parsed = JSON.parse(latest.suggestionJson) as { markdown?: string };
    markdown = parsed.markdown ?? latest.rationale;
  } catch {
    markdown = latest.rationale;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-control bg-mint-100 px-4 py-3 text-left shadow-card transition active:scale-[0.99]"
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-forest-950 text-white">
          <Sparkles className="h-4 w-4" strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-caption font-bold uppercase tracking-wider text-forest-800">
            Quartals-Insight · {formatDateDe(latest.date)}
          </div>
          <div className="mt-0.5 truncate text-label text-ink">
            Claude hat einen Brief für dich geschrieben.
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-forest-800" strokeWidth={2.5} />
      </button>

      <Sheet open={open} onOpenChange={setOpen} title="Quartals-Insight">
        <article className="prose prose-sm max-w-none whitespace-pre-wrap pb-2 text-body leading-relaxed text-ink">
          {markdown}
        </article>
      </Sheet>
    </>
  );
}
