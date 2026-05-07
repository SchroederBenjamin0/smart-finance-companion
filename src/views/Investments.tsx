import { Sparkles, TrendingUp } from 'lucide-react';
import { HeroHeader } from '@/components/layout/HeroHeader';
import { useAccountsStore } from '@/stores/accounts';
import { formatEur } from '@/lib/currency';

export function Investments() {
  const investment = useAccountsStore((s) =>
    s.accounts.find((a) => a.type === 'investment'),
  );
  const balance = investment?.balance ?? 0;

  return (
    <>
      <HeroHeader>
        <p className="text-[13px] font-medium uppercase tracking-wide text-mint-200">
          Trade Republic
        </p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight">
          Portfolio
        </h1>
      </HeroHeader>

      <div className="px-4 pt-4">
        <div className="rounded-[22px] bg-white p-5 shadow-card">
          <p className="text-[13px] font-medium text-ink-subtle">
            Investment-Saldo
          </p>
          <div className="mt-1 text-[36px] font-semibold leading-none tabular-nums text-ink">
            {formatEur(balance)}
          </div>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-forest-100 px-2.5 py-1 text-[12px] font-medium text-forest-800">
            <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.5} />
            Performance ab Sprint 3
          </div>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-[22px] bg-white p-4 shadow-card">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-800">
            <Sparkles className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
              Plan · Bald verfügbar
            </div>
            <p className="mt-0.5 text-[13px] leading-snug text-ink">
              Sobald deine Holdings synchronisiert sind, schlägt Claude jeden
              Monat eine Verteilung vor und du öffnest sie direkt in Trade
              Republic.
            </p>
          </div>
        </div>

        <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-wider text-ink-subtle">
          Holdings & Drift
        </h2>
        <div className="mt-3 rounded-[22px] bg-white p-5 shadow-card">
          <p className="text-sm text-ink-muted">
            Yahoo-Sync und Drift-Analyse sind ab Sprint 3 verfügbar. Bis dahin
            wächst dein Investment-Konto allein durch Auto-Split.
          </p>
        </div>
      </div>
    </>
  );
}
