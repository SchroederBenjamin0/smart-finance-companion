import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react';
import type { IncomeEntry, IncomeSource, Transaction } from '@/db/types';
import { formatEur } from '@/lib/currency';
import { isInternalTransfer } from '@/modules/spending';

export type RecentItem =
  | { kind: 'income'; entry: IncomeEntry }
  | { kind: 'expense'; transaction: Transaction };

interface Props {
  items: RecentItem[];
  onSelect?: (item: RecentItem) => void;
}

const SOURCE_LABEL: Record<IncomeSource, string> = {
  main_job: 'Hauptjob',
  dj_gig: 'DJ-Gig',
  other: 'Sonstiges',
};

export function RecentList({ items, onSelect }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-[22px] bg-surface p-5 text-center shadow-card">
        <p className="text-sm text-ink-muted">
          Noch keine Einträge. Tippe auf <strong>Add</strong>, um die erste
          Einnahme oder Ausgabe zu erfassen.
        </p>
      </div>
    );
  }
  return (
    <div className="row-divider rounded-[22px] bg-surface shadow-card">
      {items.map((it, i) => {
        if (it.kind === 'income') {
          return (
            <RecentRow
              key={`i-${it.entry.id}`}
              icon={ArrowUpRight}
              title={SOURCE_LABEL[it.entry.source]}
              subtitle={it.entry.note ?? 'Einnahme'}
              amount={it.entry.amount}
              when={formatRelativeDate(it.entry.date)}
              positive
              index={i}
              onClick={onSelect ? () => onSelect(it) : undefined}
            />
          );
        }
        // Sign of the persisted transaction amount decides direction — a
        // Revolut top-up is stored positive and renders incoming/emerald.
        // Umbuchungen (own-account moves) render neutral: no red/green.
        const tx = it.transaction;
        const isTransfer = isInternalTransfer(tx.category);
        const isIncoming = tx.amount >= 0;
        return (
          <RecentRow
            key={`t-${tx.id}`}
            icon={
              isTransfer
                ? ArrowLeftRight
                : isIncoming
                  ? ArrowUpRight
                  : ArrowDownLeft
            }
            title={tx.counterparty}
            subtitle={tx.category}
            amount={tx.amount}
            when={formatRelativeDate(tx.date)}
            positive={isIncoming}
            neutral={isTransfer}
            index={i}
            onClick={onSelect ? () => onSelect(it) : undefined}
          />
        );
      })}
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
  neutral?: boolean;
  index: number;
  onClick?: () => void;
}

function RecentRow({
  icon: Icon,
  title,
  subtitle,
  amount,
  when,
  positive,
  neutral = false,
  index,
  onClick,
}: RowProps) {
  const Element = (onClick ? 'button' : 'div') as 'button';
  const bubbleClass = neutral
    ? 'bg-paper text-ink-muted'
    : positive
      ? 'bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200'
      : 'bg-red-50 text-red-600';
  const amountClass = neutral
    ? 'text-ink-muted'
    : positive
      ? 'text-emerald-700 dark:text-emerald-400'
      : 'text-ink';
  const prefix = neutral ? '' : positive ? '+' : '';
  const shownAmount = neutral ? Math.abs(amount) : amount;
  return (
    <Element
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 animate-list-enter text-left transition active:bg-paper"
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${bubbleClass}`}
      >
        <Icon className="h-4 w-4" strokeWidth={2.5} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-semibold text-ink">
          {title}
        </div>
        <div className="truncate text-meta text-ink-subtle">{subtitle}</div>
      </div>
      <div className="text-right">
        <div
          className={`text-body font-semibold tabular-nums ${amountClass}`}
        >
          {prefix}
          {formatEur(shownAmount)}
        </div>
        <div className="text-caption text-ink-subtle">{when}</div>
      </div>
    </Element>
  );
}

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
