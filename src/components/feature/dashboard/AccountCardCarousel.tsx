import type { Account, AccountType } from '@/db/types';
import { formatEur } from '@/lib/currency';

type BankAccountType = Extract<AccountType, 'fun' | 'savings'>;

interface Props {
  accounts: Account[];
  funPct: number;
  savingsPct: number;
  portfolioValue?: number;
  portfolioPositionCount?: number;
}

const META: Record<
  BankAccountType,
  { emoji: string; label: string; gradient: string }
> = {
  fun: { emoji: '🎉', label: 'Fun-Geld', gradient: 'bg-card-fun' },
  savings: { emoji: '🏦', label: 'Sparkonto', gradient: 'bg-card-savings' },
};

const ORDER: BankAccountType[] = ['fun', 'savings'];

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
  // Portfolio-Card immer zeigen, sie ist die dritte Net-Worth-Kategorie.
  const showPortfolio = true;

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex snap-x snap-mandatory gap-3 pr-4">
        {ORDER.map((type) => {
          const acc = accounts.find((a) => a.type === type);
          const meta = META[type];
          return (
            <li
              key={type}
              className={`relative shrink-0 snap-start ${meta.gradient} flex h-[142px] w-[180px] flex-col justify-between overflow-hidden rounded-[22px] p-[18px] text-white shadow-card`}
            >
              <div
                className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-surface/[0.10]"
                aria-hidden="true"
              />
              <div className="relative">
                <div className="text-[22px] leading-none">{meta.emoji}</div>
                <div className="mt-2 text-[13px] font-medium opacity-90">
                  {meta.label}
                </div>
              </div>
              <div className="relative">
                <div className="text-2xl font-semibold tabular-nums">
                  {formatEur(acc?.balance ?? 0)}
                </div>
                <div className="mt-1 text-[11px] font-medium opacity-80">
                  {pct[type]}% · auto-split
                </div>
              </div>
            </li>
          );
        })}

        {showPortfolio && (
          <li className="relative shrink-0 snap-start bg-card-investment flex h-[142px] w-[180px] flex-col justify-between overflow-hidden rounded-[22px] p-[18px] text-white shadow-card">
            <div
              className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-surface/[0.10]"
              aria-hidden="true"
            />
            <div className="relative">
              <div className="text-[22px] leading-none">📈</div>
              <div className="mt-2 text-[13px] font-medium opacity-90">
                Portfolio (TR)
              </div>
            </div>
            <div className="relative">
              <div className="text-2xl font-semibold tabular-nums">
                {formatEur(portfolioValue)}
              </div>
              <div className="mt-1 text-[11px] font-medium opacity-80">
                {portfolioPositionCount > 0
                  ? `${portfolioPositionCount} Position${portfolioPositionCount === 1 ? '' : 'en'}`
                  : 'PDF-Import oder Position hinzufügen'}
              </div>
            </div>
          </li>
        )}
      </ul>
    </div>
  );
}
