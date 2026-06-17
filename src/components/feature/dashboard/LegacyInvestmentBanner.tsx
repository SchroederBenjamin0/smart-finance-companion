import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { configRepo } from '@/db/repositories/config';
import { ALL_CONFIG_KEYS } from '@/db/types';
import { formatEur } from '@/lib/currency';

export function LegacyInvestmentBanner() {
  const [amount, setAmount] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      const [legacy, dismissed] = await Promise.all([
        configRepo.getJson<number>(ALL_CONFIG_KEYS.legacyInvestmentBalance),
        configRepo.getJson<boolean>(
          ALL_CONFIG_KEYS.legacyInvestmentBannerDismissed,
        ),
      ]);
      if (
        legacy.ok &&
        typeof legacy.value === 'number' &&
        legacy.value > 0 &&
        !(dismissed.ok && dismissed.value === true)
      ) {
        setAmount(legacy.value);
      }
    })();
  }, []);

  if (amount === null) return null;

  return (
    <div className="flex items-start gap-3 rounded-control bg-mint-100 px-4 py-3 text-sm text-forest-900 shadow-card">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-forest-950 text-white">
        <Info className="h-4 w-4" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Investment-Bucket bereinigt</div>
        <div className="mt-0.5 text-meta leading-snug text-forest-800">
          Vor dem Update lagen {formatEur(amount)} im internen
          Investment-Konto. Net Worth zeigt jetzt nur noch Fun + Sparkonto +
          dein echtes TR-Portfolio. Bitte vergleiche mit deinem Trade-Republic-
          Saldo — die Größenordnung sollte zu deinen Sparplan-Beiträgen passen.
        </div>
      </div>
      <button
        type="button"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-forest-800 active:bg-mint-200"
        aria-label="Hinweis ausblenden"
        onClick={async () => {
          await configRepo.setJson(
            ALL_CONFIG_KEYS.legacyInvestmentBannerDismissed,
            true,
          );
          setAmount(null);
        }}
      >
        <X className="h-4 w-4" strokeWidth={2.25} />
      </button>
    </div>
  );
}
