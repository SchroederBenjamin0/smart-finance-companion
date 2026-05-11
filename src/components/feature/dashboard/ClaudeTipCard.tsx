import { Sparkles } from 'lucide-react';

interface Props {
  message: string;
}

export function ClaudeTipCard({ message }: Props) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-surface p-3.5 shadow-card">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200">
        <Sparkles className="h-4.5 w-4.5" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
          Claude · Tipp
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-ink">{message}</p>
      </div>
    </div>
  );
}
