import { TrendingUp, type LucideIcon } from 'lucide-react';
import type { Account, AccountType } from '@/db/types';
import { formatEur } from '@/lib/currency';
import { ACCOUNT_ICON } from '@/lib/account-icons';

type BankAccountType = Extract<AccountType, 'fun' | 'savings'>;

interface Props {
  accounts: Account[];
  funPct: number;
  savingsPct: number;
  portfolioValue?: number;
  portfolioPositionCount?: number;
}

const META: Record<BankAccountType, { Icon: LucideIcon; label: string }> = {
  fun: { Icon: ACCOUNT_ICON.fun, label: 'Fun-Geld' },
  savings: { Icon: ACCOUNT_ICON.savings, label: 'Sparkonto' },
};

const ORDER: BankAccountType[] = ['fun', 'savings'];

const CARD =
  'flex w-[172px] shrink-0 snap-start flex-col rounded-card border border-divider bg-surface p-[18px] shadow-card';
const ICON_SQUARE =
  'mb-4 grid h-[38px] w-[38px] place-items-center rounded-chip bg-forest-100 text-forest-800';

export function AccountCardCarousel({
  accounts,
  funPct,
  savingsPct,
  portfolioValue = 0,
  portfolioPositionCount = 0,
}: Props) {
  const pct: Record<BankAccountType, number> = {
    fun: funPct,
    savings: savingsPct,
  };
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex snap-x snap-mandatory gap-3 pr-4">
        {ORDER.map((type) => {
          const acc = accounts.find((a) => a.type === type);
          const meta = META[type];
          return (
            <li key={type} className={CARD}>
              <div className={ICON_SQUARE}>
                <meta.Icon className="h-5 w-5" strokeWidth={2.25} />
              </div>
              <div className="text-meta font-medium text-ink-muted">
                {meta.label}
              </div>
              <div className="mt-1 text-title font-semibold tabular-nums text-ink">
                {formatEur(acc?.balance ?? 0)}
              </div>
              <div className="mt-1 text-caption text-ink-subtle">
                {pct[type]}% · auto-split
              </div>
            </li>
          );
        })}

        <li className={CARD}>
          <div className={ICON_SQUARE}>
            <TrendingUp className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div className="text-meta font-medium text-ink-muted">
            Portfolio (TR)
          </div>
          <div className="mt-1 text-title font-semibold tabular-nums text-ink">
            {formatEur(portfolioValue)}
          </div>
          <div className="mt-1 text-caption text-ink-subtle">
            {portfolioPositionCount > 0
              ? `${portfolioPositionCount} Position${portfolioPositionCount === 1 ? '' : 'en'}`
              : 'PDF-Import oder Position'}
          </div>
        </li>
      </ul>
    </div>
  );
}
