import { useEffect, useState } from 'react';
import { ChevronRight, Sparkles, type LucideIcon } from 'lucide-react';
import { incomeRepo } from '@/db/repositories/income';
import { allocationsRepo } from '@/db/repositories/allocations';
import { recommendationsRepo } from '@/db/repositories/recommendations';
import type {
  Allocation,
  IncomeEntry,
  IncomeSource,
  Recommendation,
} from '@/db/types';
import { formatEur } from '@/lib/currency';
import { formatDateDe } from '@/lib/date';
import { ACCOUNT_ICON } from '@/lib/account-icons';

export interface IncomeHistoryItem {
  income: IncomeEntry;
  allocations: Allocation[];
  recommendation: Recommendation | null;
}

interface Props {
  refreshKey: number;
  onSelect: (item: IncomeHistoryItem) => void;
}

const SOURCE_LABEL: Record<IncomeSource, string> = {
  main_job: 'Hauptjob',
  dj_gig: 'DJ-Gig',
  other: 'Sonstiges',
};

export function IncomeHistoryList({ refreshKey, onSelect }: Props) {
  const [items, setItems] = useState<IncomeHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const r = await incomeRepo.findRecent(20);
      if (!r.ok) {
        if (!cancelled) {
          setItems([]);
          setLoading(false);
        }
        return;
      }
      const enriched = await Promise.all(
        r.value.map(async (income) => {
          const [allocR, recR] = await Promise.all([
            allocationsRepo.findByIncome(income.id),
            recommendationsRepo.findByIncomeEntry(income.id),
          ]);
          return {
            income,
            allocations: allocR.ok ? allocR.value : [],
            recommendation: recR.ok ? recR.value : null,
          };
        }),
      );
      if (!cancelled) {
        setItems(enriched);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="card p-5 text-center">
        <p className="text-sm text-ink-muted">Lade Historie…</p>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="card p-5 text-center">
        <p className="text-sm text-ink-muted">
          Noch keine Einnahmen erfasst.
        </p>
      </div>
    );
  }
  return (
    <div className="card row-divider p-0">
      {items.map((it, i) => (
        <HistoryRow
          key={it.income.id}
          item={it}
          index={i}
          onClick={() => onSelect(it)}
        />
      ))}
    </div>
  );
}

function HistoryRow({
  item,
  index,
  onClick,
}: {
  item: IncomeHistoryItem;
  index: number;
  onClick: () => void;
}) {
  const { income, allocations, recommendation } = item;
  const findAlloc = (type: Allocation['accountType']) =>
    allocations.find((a) => a.accountType === type)?.amount ?? 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 px-4 py-3 text-left animate-list-enter transition active:bg-paper"
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="truncate text-body font-semibold text-ink">
            {SOURCE_LABEL[income.source]}
          </div>
          <div className="shrink-0 text-body font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            +{formatEur(income.amount)}
          </div>
        </div>
        <div className="mt-0.5 text-caption text-ink-subtle">
          {formatDateDe(income.date)}
          {income.note ? ` · ${income.note}` : ''}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-caption">
          <Chip Icon={ACCOUNT_ICON.fun} amount={findAlloc('fun')} />
          <Chip Icon={ACCOUNT_ICON.savings} amount={findAlloc('savings')} />
          <Chip Icon={ACCOUNT_ICON.investment} amount={findAlloc('investment')} plan />
          {recommendation && (
            <span className="inline-flex items-center gap-1 rounded-full bg-mint-100 px-2 py-0.5 font-medium text-forest-800">
              <Sparkles className="h-3 w-3" strokeWidth={2.5} />
              Claude-Plan
            </span>
          )}
        </div>
      </div>
      <ChevronRight
        className="mt-1 h-4 w-4 shrink-0 text-ink-subtle"
        strokeWidth={2.5}
      />
    </button>
  );
}

function Chip({
  Icon,
  amount,
  plan,
}: {
  Icon: LucideIcon;
  amount: number;
  plan?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium tabular-nums ${
        plan
          ? 'bg-paper text-ink-muted'
          : 'bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200'
      }`}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {formatEur(amount)}
      {plan && <span className="ml-0.5 text-caption uppercase">Plan</span>}
    </span>
  );
}
