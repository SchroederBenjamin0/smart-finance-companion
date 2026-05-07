import {
  ArrowDownLeft,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react';
import type { IncomeEntry, IncomeSource } from '@/db/types';
import { formatEur } from '@/lib/currency';

interface Props {
  items: IncomeEntry[];
}

const SOURCE_LABEL: Record<IncomeSource, string> = {
  main_job: 'Hauptjob',
  dj_gig: 'DJ-Gig',
  other: 'Sonstiges',
};

export function RecentList({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-[22px] bg-white p-5 text-center shadow-card">
        <p className="text-sm text-ink-muted">
          Noch keine Einträge. Tippe auf <strong>Add</strong>, um die erste
          Einnahme zu erfassen.
        </p>
      </div>
    );
  }
  return (
    <div className="row-divider rounded-[22px] bg-white shadow-card">
      {items.map((it) => (
        <RecentRow
          key={it.id}
          icon={ArrowUpRight}
          title={SOURCE_LABEL[it.source]}
          subtitle={it.note ?? 'Einnahme'}
          amount={it.amount}
          when={formatRelativeDate(it.date)}
          positive
        />
      ))}
    </div>
  );
}

interface RowProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  amount: number;
  when: string;
  positive: boolean;
}

function RecentRow({
  icon: Icon,
  title,
  subtitle,
  amount,
  when,
  positive,
}: RowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-800">
        <Icon className="h-4 w-4" strokeWidth={2.5} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-ink">
          {title}
        </div>
        <div className="truncate text-[12px] text-ink-subtle">{subtitle}</div>
      </div>
      <div className="text-right">
        <div
          className={`text-[15px] font-semibold tabular-nums ${
            positive ? 'text-emerald-700' : 'text-ink'
          }`}
        >
          {positive ? '+' : ''}
          {formatEur(amount)}
        </div>
        <div className="text-[11px] text-ink-subtle">{when}</div>
      </div>
    </div>
  );
}

// Treat ArrowDownLeft as used so the import doesn't trip noUnusedLocals
// once non-income rows are added in Sprint 2.
void ArrowDownLeft;

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfDate = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
  ).getTime();
  const diff = (startOfToday - startOfDate) / (1000 * 60 * 60 * 24);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Gestern';
  if (diff > 1 && diff < 7) return `vor ${Math.round(diff)} Tagen`;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.`;
}
