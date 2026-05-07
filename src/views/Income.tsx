import { useMemo, useState } from 'react';
import { ArrowRight, Briefcase, Disc3, MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { HeroHeader } from '@/components/layout/HeroHeader';
import { incomeRepo } from '@/db/repositories/income';
import type { IncomeSource } from '@/db/types';
import { formatEur, parseEurInput, round2 } from '@/lib/currency';
import { todayIso } from '@/lib/date';
import { classify } from '@/modules/income-detector';
import { split } from '@/modules/allocation';
import { useAccountsStore } from '@/stores/accounts';
import { useConfigStore } from '@/stores/config';
import { useNavStore } from '@/stores/navigation';
import { useToastStore } from '@/stores/toast';

interface SourceDef {
  id: IncomeSource;
  label: string;
  Icon: LucideIcon;
}

const SOURCES: SourceDef[] = [
  { id: 'main_job', label: 'Hauptjob', Icon: Briefcase },
  { id: 'dj_gig', label: 'DJ-Gig', Icon: Disc3 },
  { id: 'other', label: 'Sonstiges', Icon: MoreHorizontal },
];

const QUICK_AMOUNTS = [100, 300, 500, 1000];

export function Income() {
  const [amountText, setAmountText] = useState('');
  const [source, setSource] = useState<IncomeSource>('main_job');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const ruleFor = useConfigStore((s) => s.ruleFor);
  const thresholds = useConfigStore((s) => s.thresholds);
  const accounts = useAccountsStore((s) => s.accounts);
  const reloadAccounts = useAccountsStore((s) => s.load);
  const pushToast = useToastStore((s) => s.push);
  const setActiveTab = useNavStore((s) => s.setActiveTab);

  const amount = parseEurInput(amountText);
  const validAmount = amount !== null && amount > 0;

  const savingsBalance =
    accounts.find((a) => a.type === 'savings')?.balance ?? 0;

  const preview = useMemo(() => {
    if (!validAmount || amount === null) return null;
    try {
      return split(amount, ruleFor(source), savingsBalance);
    } catch {
      return null;
    }
  }, [amount, validAmount, source, savingsBalance, ruleFor]);

  async function submit() {
    if (!validAmount || amount === null || !preview) return;
    setSubmitting(true);
    try {
      const classification = classify(amount, source, thresholds);
      const r = await incomeRepo.createWithAllocations({
        amount: round2(amount),
        source,
        date,
        note: note.trim() || null,
        classification,
        funAmount: preview.fun,
        savingsAmount: preview.savings,
        investmentAmount: preview.investment,
      });
      if (!r.ok) throw r.error;

      await reloadAccounts();
      pushToast(
        `${formatEur(amount)} verteilt auf 3 Konten`,
        'success',
      );
      setAmountText('');
      setNote('');
      setSource('main_job');
      setDate(todayIso());
      setActiveTab('home');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushToast(`Fehler: ${msg}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const rule = ruleFor(source);

  return (
    <>
      <HeroHeader>
        <p className="text-[13px] font-medium uppercase tracking-wide text-mint-200">
          Neuer Eintrag
        </p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight">
          Einnahme erfassen
        </h1>

        <div className="mt-6 grid grid-cols-3 gap-2">
          {SOURCES.map((s) => {
            const active = s.id === source;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSource(s.id)}
                aria-pressed={active}
                className={`flex flex-col items-center gap-1.5 rounded-2xl px-3 py-3 text-[12px] font-semibold transition ${
                  active
                    ? 'bg-white text-forest-950'
                    : 'bg-white/10 text-white/85'
                }`}
              >
                <s.Icon className="h-5 w-5" strokeWidth={2.25} />
                {s.label}
              </button>
            );
          })}
        </div>
      </HeroHeader>

      <div className="px-4 pt-5">
        <div className="rounded-[22px] bg-white p-5 shadow-card">
          <p className="text-[13px] font-medium text-ink-subtle">
            Du erhältst
          </p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-[28px] font-semibold text-ink-subtle">
              €
            </span>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              autoComplete="off"
              placeholder="0,00"
              aria-label="Betrag in Euro"
              className="min-w-0 flex-1 bg-transparent text-[44px] font-semibold tabular-nums text-ink outline-none placeholder:text-ink-subtle/40"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setAmountText(String(q))}
                className="pill-chip"
              >
                €{q}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[12px] font-medium text-ink-subtle">
              Datum
            </span>
            <input
              type="date"
              className="input-field mt-1"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-[12px] font-medium text-ink-subtle">
              Notiz
            </span>
            <input
              type="text"
              className="input-field mt-1"
              placeholder="optional"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>

        <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-wider text-ink-subtle">
          Auto-Split Vorschau
        </h2>
        <div className="mt-3 row-divider rounded-[22px] bg-white shadow-card">
          <PreviewRow
            emoji="🎉"
            label="Fun-Geld"
            pct={rule.funPercentage}
            amount={preview?.fun ?? 0}
          />
          <PreviewRow
            emoji="🏦"
            label="Sparkonto"
            pct={rule.savingsPercentage}
            amount={preview?.savings ?? 0}
          />
          <PreviewRow
            emoji="📈"
            label="Investment"
            pct={rule.investmentPercentage}
            amount={preview?.investment ?? 0}
          />
        </div>

        {preview?.capApplied && (
          <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-[12px] text-amber-800">
            Notgroschen-Cap erreicht — Überschuss fließt ins Investment.
          </p>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!validAmount || submitting}
          className="btn-primary mt-5 w-full text-base"
        >
          {submitting ? 'Verteile…' : 'Jetzt verteilen'}
          <ArrowRight className="ml-2 h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>
    </>
  );
}

interface PreviewRowProps {
  emoji: string;
  label: string;
  pct: number;
  amount: number;
}

function PreviewRow({ emoji, label, pct, amount }: PreviewRowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-xl">
        <span aria-hidden="true">{emoji}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-ink">{label}</div>
        <div className="text-[12px] text-ink-subtle">{pct} %</div>
      </div>
      <div className="text-[15px] font-semibold tabular-nums text-emerald-700">
        +{formatEur(amount)}
      </div>
    </div>
  );
}
