import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Settings as SettingsIcon } from 'lucide-react';
import { HeroHeader } from '@/components/layout/HeroHeader';
import { AccountCardCarousel } from '@/components/feature/dashboard/AccountCardCarousel';
import {
  RecentList,
  type RecentItem,
} from '@/components/feature/dashboard/RecentList';
import {
  EntryDetailsSheet,
  type EntrySelection,
} from '@/components/feature/dashboard/EntryDetailsSheet';
import { NewsBanner } from '@/components/feature/dashboard/NewsBanner';
import { QuarterlyInsightBanner } from '@/components/feature/dashboard/QuarterlyInsightBanner';
import { LegacyInvestmentBanner } from '@/components/feature/dashboard/LegacyInvestmentBanner';
import { incomeRepo } from '@/db/repositories/income';
import { positionsRepo } from '@/db/repositories/positions';
import { transactionsRepo } from '@/db/repositories/transactions';
import type {
  IncomeEntry,
  InvestmentPosition,
  Transaction,
} from '@/db/types';
import { formatEur } from '@/lib/currency';
import { formatMonthYearDe } from '@/lib/date';
import { useAccountsStore } from '@/stores/accounts';
import { useConfigStore } from '@/stores/config';
import { useNavStore } from '@/stores/navigation';

export function Dashboard() {
  const accounts = useAccountsStore((s) => s.accounts);
  const loaded = useAccountsStore((s) => s.loaded);
  const load = useAccountsStore((s) => s.load);
  const rules = useConfigStore((s) => s.rules);
  const setActiveTab = useNavStore((s) => s.setActiveTab);

  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [expenses, setExpenses] = useState<Transaction[]>([]);
  const [positions, setPositions] = useState<InvestmentPosition[]>([]);
  const [selection, setSelection] = useState<EntrySelection | null>(null);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const reloadActivity = async () => {
    const [iR, tR, pR] = await Promise.all([
      incomeRepo.findRecent(10),
      transactionsRepo.findRecent(10),
      positionsRepo.findAll(),
    ]);
    if (iR.ok) setIncomes(iR.value);
    if (tR.ok) setExpenses(tR.value);
    if (pR.ok) setPositions(pR.value);
  };

  useEffect(() => {
    void reloadActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  const recent = useMemo<RecentItem[]>(() => {
    const merged: RecentItem[] = [
      ...incomes.map((entry) => ({ kind: 'income' as const, entry })),
      ...expenses.map((transaction) => ({
        kind: 'expense' as const,
        transaction,
      })),
    ];
    merged.sort((a, b) => {
      const da = a.kind === 'income' ? a.entry.date : a.transaction.date;
      const db = b.kind === 'income' ? b.entry.date : b.transaction.date;
      return db.localeCompare(da);
    });
    return merged.slice(0, 6);
  }, [incomes, expenses]);

  const portfolioValue = positions.reduce(
    (sum, p) => sum + p.currentValue,
    0,
  );
  // Net Worth = Fun + Sparkonto + Portfolio. accountsTotal enthält
  // konstruktionsbedingt keine investment-Buckets mehr (Migration v5).
  const accountsTotal = accounts
    .filter((a) => a.type === 'fun' || a.type === 'savings')
    .reduce((sum, a) => sum + a.balance, 0);
  const total = accountsTotal + portfolioValue;
  const monthDelta = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const incomeSum = incomes
      .filter((r) => r.date >= monthStart)
      .reduce((sum, r) => sum + r.amount, 0);
    const expenseSum = expenses
      .filter((r) => r.date >= monthStart)
      .reduce((sum, r) => sum + r.amount, 0);
    return incomeSum + expenseSum;
  }, [incomes, expenses]);

  return (
    <>
      <HeroHeader>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] font-medium uppercase tracking-wide text-mint-200">
              Willkommen zurück
            </p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight">
              {formatMonthYearDe()}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            aria-label="Einstellungen"
            className="grid h-10 w-10 place-items-center rounded-full bg-surface/10 text-white"
          >
            <SettingsIcon className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </div>

        <div className="mt-7">
          <p className="text-[13px] font-medium text-mint-200">
            Gesamt-Saldo
          </p>
          <div className="mt-1 text-[40px] font-semibold leading-none tabular-nums">
            {formatEur(total)}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
            {monthDelta > 0 && (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-surface/15 px-2.5 py-1 font-medium">
                  <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={3} />
                  +{formatEur(monthDelta)}
                </span>
                <span className="text-mint-200">diesen Monat</span>
              </>
            )}
            {portfolioValue > 0 && (
              <span className="rounded-full bg-surface/10 px-2.5 py-1 text-[12px] text-mint-200">
                davon Portfolio {formatEur(portfolioValue)}
              </span>
            )}
          </div>
        </div>
      </HeroHeader>

      <div className="space-y-3 px-4 pt-4 animate-view-enter">
        <LegacyInvestmentBanner />
        <QuarterlyInsightBanner />
        <NewsBanner />
      </div>

      <section className="mt-5">
        <header className="flex items-center justify-between px-4">
          <h2 className="text-[15px] font-semibold text-ink">Meine Konten</h2>
          <button
            type="button"
            onClick={() => setActiveTab('inv')}
            className="text-[13px] font-medium text-ink-subtle"
          >
            Alle ansehen
          </button>
        </header>
        <div className="mt-3">
          <AccountCardCarousel
            accounts={accounts}
            funPct={rules.main_job.funPercentage}
            savingsPct={rules.main_job.savingsPercentage}
            portfolioValue={portfolioValue}
            portfolioPositionCount={positions.length}
          />
        </div>
      </section>

      <section className="mt-6 px-4">
        <header className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Letzte Einträge</h2>
          <button
            type="button"
            className="text-[13px] font-medium text-ink-subtle"
            onClick={() => setActiveTab('add')}
          >
            Neuer Eintrag
          </button>
        </header>
        <div className="mt-3">
          <RecentList
            items={recent}
            onSelect={(it) => setSelection(it as EntrySelection)}
          />
        </div>
      </section>

      <EntryDetailsSheet
        open={selection !== null}
        onOpenChange={(o) => {
          if (!o) setSelection(null);
        }}
        selection={selection}
        onDeleted={() => void reloadActivity()}
      />
    </>
  );
}
