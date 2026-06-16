import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, type LucideIcon } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import type { Allocation, IncomeSource } from '@/db/types';
import { formatEur } from '@/lib/currency';
import { formatDateDe } from '@/lib/date';
import { RecommendationCard } from '@/components/feature/advisor/RecommendationCard';
import type { IncomeHistoryItem } from './IncomeHistoryList';
import type { AdvisorRecommendation } from '@/services/advisor';
import { ACCOUNT_ICON } from '@/lib/account-icons';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: IncomeHistoryItem | null;
}

const SOURCE_LABEL: Record<IncomeSource, string> = {
  main_job: 'Hauptjob',
  dj_gig: 'DJ-Gig',
  other: 'Sonstiges',
};

export function IncomeHistorySheet({ open, onOpenChange, item }: Props) {
  const [showAdvisor, setShowAdvisor] = useState(false);

  if (!item) return null;
  const { income, allocations, recommendation } = item;
  const total = allocations.reduce((s, a) => s + a.amount, 0) || income.amount;
  const findAlloc = (type: Allocation['accountType']) =>
    allocations.find((a) => a.accountType === type);

  const advisor = parseAdvisor(recommendation?.suggestionJson);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Einnahme-Details"
      footer={
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => onOpenChange(false)}
        >
          Schließen
        </button>
      }
    >
      <div className="space-y-4 pt-2">
        <div className="rounded-2xl bg-paper p-4">
          <div className="text-[12px] uppercase tracking-wider text-ink-subtle">
            {SOURCE_LABEL[income.source]} · {formatDateDe(income.date)}
          </div>
          <div className="mt-1 text-3xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            +{formatEur(income.amount)}
          </div>
          {income.note && (
            <div className="mt-1 text-[13px] text-ink-muted">{income.note}</div>
          )}
        </div>

        <div className="row-divider rounded-[22px] bg-surface shadow-card">
          <SplitRow
            Icon={ACCOUNT_ICON.fun}
            label="Fun-Geld"
            amount={findAlloc('fun')?.amount ?? 0}
            total={total}
          />
          <SplitRow
            Icon={ACCOUNT_ICON.savings}
            label="Sparkonto"
            amount={findAlloc('savings')?.amount ?? 0}
            total={total}
          />
          <SplitRow
            Icon={ACCOUNT_ICON.investment}
            label="Investment (Plan)"
            amount={findAlloc('investment')?.amount ?? 0}
            total={total}
            plan
          />
        </div>

        {recommendation && advisor && (
          <div className="rounded-[22px] bg-mint-100 px-4 py-3 shadow-card">
            <button
              type="button"
              className="flex w-full items-center gap-3 text-left"
              onClick={() => setShowAdvisor((v) => !v)}
              aria-expanded={showAdvisor}
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-forest-950 text-white">
                <Sparkles className="h-4 w-4" strokeWidth={2.25} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-forest-800">
                  Claude · Sparplan-Vorschlag
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-ink">
                  {advisor.summary}
                </p>
              </div>
              {showAdvisor ? (
                <ChevronUp className="h-4 w-4 text-forest-800" strokeWidth={2.5} />
              ) : (
                <ChevronDown
                  className="h-4 w-4 text-forest-800"
                  strokeWidth={2.5}
                />
              )}
            </button>
            {showAdvisor && (
              <div className="mt-3 space-y-2">
                {advisor.allocations.map((a, i) => (
                  <RecommendationCard
                    key={`${a.isin || a.ticker}-${i}`}
                    data={{
                      isin: a.isin || '',
                      ticker: a.ticker,
                      name: a.name,
                      amountEur: a.amountEur,
                      reason: a.reason,
                    }}
                  />
                ))}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-subtle">
                  <span>
                    Summe {formatEur(advisor.totalEur)}
                  </span>
                  {recommendation.modelName && (
                    <span>
                      {recommendation.modelName} ·{' '}
                      {formatDateDe(recommendation.date.slice(0, 10))}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {!recommendation && (
          <div className="rounded-2xl bg-paper px-4 py-3 text-[12px] text-ink-subtle">
            Für diese Einnahme wurde kein Sparplan-Vorschlag gespeichert
            (Sheet vor Antwort geschlossen oder Fehler beim LLM-Call).
          </div>
        )}
      </div>
    </Sheet>
  );
}

function SplitRow({
  Icon,
  label,
  amount,
  total,
  plan,
}: {
  Icon: LucideIcon;
  label: string;
  amount: number;
  total: number;
  plan?: boolean;
}) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200">
        <Icon className="h-5 w-5" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-ink">{label}</div>
        <div className="text-[11px] text-ink-subtle">
          {pct}%{plan && ' · nicht auf Konto verbucht'}
        </div>
      </div>
      <div
        className={`text-[15px] font-semibold tabular-nums ${
          plan ? 'text-ink' : 'text-emerald-700 dark:text-emerald-400'
        }`}
      >
        {plan ? '' : '+'}
        {formatEur(amount)}
      </div>
    </div>
  );
}

function parseAdvisor(json?: string): AdvisorRecommendation | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as AdvisorRecommendation;
  } catch {
    return null;
  }
}
