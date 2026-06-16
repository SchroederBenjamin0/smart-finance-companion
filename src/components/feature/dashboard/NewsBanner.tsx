import { useEffect, useState } from 'react';
import { ChevronRight, ExternalLink, Newspaper, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { newsRepo } from '@/db/repositories/news';
import type { NewsEvent } from '@/db/types';
import { formatDateDe } from '@/lib/date';

export function NewsBanner() {
  const [items, setItems] = useState<NewsEvent[]>([]);
  const [open, setOpen] = useState(false);

  const reload = async () => {
    const r = await newsRepo.findRecentHigh(5);
    if (r.ok) setItems(r.value);
  };

  useEffect(() => {
    void reload();
  }, []);

  if (items.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-left shadow-card transition active:scale-[0.99]"
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200">
          <Newspaper className="h-4 w-4" strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-caption font-bold uppercase tracking-wider text-ink-subtle">
            News · {items.length} relevant
          </div>
          <div className="mt-0.5 truncate text-label text-ink">
            {items[0]!.ticker}: {items[0]!.summary}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-ink-subtle" strokeWidth={2.5} />
      </button>

      <Sheet open={open} onOpenChange={setOpen} title="Materiell relevante News">
        <div className="space-y-3 pb-2">
          {items.map((n) => (
            <div
              key={n.id}
              className="rounded-2xl border border-forest-950/10 bg-surface p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-caption font-medium text-ink-subtle">
                    <span className="rounded-full bg-forest-100 px-2 py-0.5 font-bold text-forest-800">
                      {n.ticker}
                    </span>
                    <span>{n.category}</span>
                    <span>·</span>
                    <span>{formatDateDe(n.publishedAt)}</span>
                  </div>
                  <div className="mt-1 text-body font-semibold leading-snug text-ink">
                    {n.headline}
                  </div>
                  <p className="mt-1 text-meta text-ink-muted">{n.summary}</p>
                </div>
                <button
                  type="button"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-paper text-ink-subtle"
                  aria-label="Ausblenden"
                  onClick={() =>
                    void newsRepo.dismiss(n.id).then(() => void reload())
                  }
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              </div>
              {n.url && (
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener"
                  className="mt-2 inline-flex items-center gap-1 text-meta font-semibold text-forest-700"
                >
                  Quelle öffnen{' '}
                  <ExternalLink className="h-3 w-3" strokeWidth={2.5} />
                </a>
              )}
            </div>
          ))}
        </div>
      </Sheet>
    </>
  );
}
