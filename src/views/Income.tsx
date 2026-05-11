import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  Disc3,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { HeroHeader } from '@/components/layout/HeroHeader';
import { AdvisorSheet } from '@/components/feature/income/AdvisorSheet';
import { incomeRepo } from '@/db/repositories/income';
import { transactionsRepo } from '@/db/repositories/transactions';
import type { AccountType, IncomeSource } from '@/db/types';
import { formatEur, parseEurInput, round2 } from '@/lib/currency';
import { todayIso } from '@/lib/date';
import { classify } from '@/modules/income-detector';
import { split } from '@/modules/allocation';
import { useAccountsStore } from '@/stores/accounts';
import { useConfigStore } from '@/stores/config';
import { useNavStore } from '@/stores/navigation';
import { useSharePrefillStore } from '@/stores/sharePrefill';
import { useToastStore } from '@/stores/toast';

type Mode = 'income' | 'expense';

const SOURCES: { id: IncomeSource; label: string; Icon: LucideIcon }[] = [
  { id: 'main_job', label: 'Hauptjob', Icon: Briefcase },
  { id: 'dj_gig', label: 'DJ-Gig', Icon: Disc3 },
  { id: 'other', label: 'Sonstiges', Icon: MoreHorizontal },
];

const ACCOUNTS: { id: AccountType; label: string; emoji: string }[] = [
  { id: 'fun', label: 'Fun-Geld', emoji: '🎉' },
  { id: 'savings', label: 'Sparkonto', emoji: '🏦' },
  { id: 'investment', label: 'Investment', emoji: '📈' },
];

const QUICK_AMOUNTS = [10, 25, 50, 100];
const INCOME_QUICK_AMOUNTS = [100, 300, 500, 1000];

const COMMON_CATEGORIES = [
  'Lebensmittel',
  'Cafés',
  'Transport',
  'Freizeit',
  'Software',
  'Sonstiges',
];

export function Income() {
  const [mode, setMode] = useState<Mode>('income');
  const [amountText, setAmountText] = useState('');
  const [source, setSource] = useState<IncomeSource>('main_job');
  const [fromAccount, setFromAccount] = useState<AccountType>('fun');
  const [counterparty, setCounterparty] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [advisorAmount, setAdvisorAmount] = useState(0);

  const ruleFor = useConfigStore((s) => s.ruleFor);
  const thresholds = useConfigStore((s) => s.thresholds);
  const accounts = useAccountsStore((s) => s.accounts);
  const reloadAccounts = useAccountsStore((s) => s.load);
  const pushToast = useToastStore((s) => s.push);
  const setActiveTab = useNavStore((s) => s.setActiveTab);

  const sharePrefill = useSharePrefillStore((s) => s.prefill);
  const clearPrefill = useSharePrefillStore((s) => s.clearPrefill);

  // Apply share-target prefill once when the view mounts with pending data
  useEffect(() => {
    if (!sharePrefill) return;
    if (sharePrefill.amount !== null && sharePrefill.amount > 0) {
      // Positive amounts → income mode
      setMode('income');
      setAmountText(String(sharePrefill.amount));
    } else if (sharePrefill.amount !== null && sharePrefill.amount < 0) {
      // Negative amounts → expense mode
      setMode('expense');
      setAmountText(String(Math.abs(sharePrefill.amount)));
    }
    setNote(sharePrefill.note);
    clearPrefill();
  // Only run once when a prefill value arrives — intentionally omit mutable setters
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharePrefill]);

  const amount = parseEurInput(amountText);
  const validAmount = amount !== null && amount > 0;

  const savingsBalance =
    accounts.find((a) => a.type === 'savings')?.balance ?? 0;
  const fromBalance =
    accounts.find((a) => a.type === fromAccount)?.balance ?? 0;

  const preview = useMemo(() => {
    if (mode !== 'income' || !validAmount || amount === null) return null;
    try {
      return split(amount, ruleFor(source), savingsBalance);
    } catch {
      return null;
    }
  }, [mode, amount, validAmount, source, savingsBalance, ruleFor]);

  const overdraw = mode === 'expense' && validAmount && amount! > fromBalance;

  async function submitIncome() {
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
      pushToast(`${formatEur(amount)} verteilt auf 3 Konten`, 'success');
      // Always show the AI sparplan advisor after a successful split,
      // regardless of amount — per user preference.
      setAdvisorAmount(preview.investment);
      setAdvisorOpen(true);
      resetForm();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushToast(`Fehler: ${msg}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitExpense() {
    if (!validAmount || amount === null) return;
    if (overdraw) {
      const ok = window.confirm(
        `${formatEur(amount)} > Saldo ${formatEur(fromBalance)} im ${labelFor(fromAccount)}. Trotzdem erfassen?`,
      );
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      const r = await transactionsRepo.createManualExpense({
        amount: round2(amount),
        counterparty: counterparty.trim() || 'Manuell',
        category: category.trim() || 'Sonstiges',
        date,
        note: note.trim() || null,
        fromAccount,
      });
      if (!r.ok) throw r.error;

      await reloadAccounts();
      pushToast(`-${formatEur(amount)} aus ${labelFor(fromAccount)}`, 'success');
      resetForm();
      setActiveTab('home');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushToast(`Fehler: ${msg}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setAmountText('');
    setNote('');
    setCounterparty('');
    setCategory('');
    setDate(todayIso());
  }

  const ctaLabel = submitting
    ? mode === 'income'
      ? 'Verteile…'
      : 'Erfasse…'
    : mode === 'income'
      ? 'Jetzt verteilen'
      : 'Ausgabe erfassen';

  const canSubmit = validAmount && !submitting;

  return (
    <>
      <HeroHeader>
        <p className="text-[13px] font-medium uppercase tracking-wide text-mint-200">
          Neuer Eintrag
        </p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight">
          {mode === 'income' ? 'Einnahme erfassen' : 'Ausgabe erfassen'}
        </h1>

        <div className="mt-4 grid h-11 grid-cols-2 rounded-2xl bg-white/10 p-1">
          <button
            type="button"
            onClick={() => setMode('income')}
            className={`flex items-center justify-center rounded-xl text-sm font-semibold transition ${
              mode === 'income' ? 'bg-white text-forest-950' : 'text-white/85'
            }`}
          >
            + Einnahme
          </button>
          <button
            type="button"
            onClick={() => setMode('expense')}
            className={`flex items-center justify-center rounded-xl text-sm font-semibold transition ${
              mode === 'expense'
                ? 'bg-white text-forest-950'
                : 'text-white/85'
            }`}
          >
            − Ausgabe
          </button>
        </div>

        {mode === 'income' ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
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
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {ACCOUNTS.map((a) => {
              const active = a.id === fromAccount;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setFromAccount(a.id)}
                  aria-pressed={active}
                  className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-3 text-[12px] font-semibold transition ${
                    active
                      ? 'bg-white text-forest-950'
                      : 'bg-white/10 text-white/85'
                  }`}
                >
                  <span className="text-xl leading-none" aria-hidden="true">
                    {a.emoji}
                  </span>
                  {a.label}
                </button>
              );
            })}
          </div>
        )}
      </HeroHeader>

      <div className="px-4 pt-5 animate-view-enter">
        <div className="rounded-[22px] bg-white p-5 shadow-card">
          <p className="text-[13px] font-medium text-ink-subtle">
            {mode === 'income' ? 'Du erhältst' : 'Du gibst aus'}
          </p>
          <div className="mt-2 flex items-baseline gap-1">
            <span
              className={`text-[28px] font-semibold ${
                mode === 'expense' ? 'text-red-500' : 'text-ink-subtle'
              }`}
            >
              {mode === 'expense' ? '−€' : '€'}
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
            {(mode === 'income' ? INCOME_QUICK_AMOUNTS : QUICK_AMOUNTS).map(
              (q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmountText(String(q))}
                  className="pill-chip"
                >
                  {mode === 'expense' ? '−' : ''}€{q}
                </button>
              ),
            )}
          </div>
          {mode === 'expense' && (
            <p className="mt-3 text-[12px] text-ink-subtle">
              Aktuelles Saldo {labelFor(fromAccount)}:{' '}
              <span
                className={`font-mono font-semibold ${
                  overdraw ? 'text-red-600' : 'text-ink'
                }`}
              >
                {formatEur(fromBalance)}
              </span>
            </p>
          )}
        </div>

        {mode === 'expense' && (
          <div className="mt-4 grid grid-cols-1 gap-3">
            <label className="block">
              <span className="text-[12px] font-medium text-ink-subtle">
                Wo?
              </span>
              <input
                type="text"
                className="input-field mt-1"
                placeholder="z.B. REWE, Café Mocca…"
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
              />
            </label>
            <div>
              <span className="text-[12px] font-medium text-ink-subtle">
                Kategorie
              </span>
              <div className="mt-1 flex flex-wrap gap-2">
                {COMMON_CATEGORIES.map((c) => {
                  const active = c === category;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(active ? '' : c)}
                      className={`h-9 rounded-full px-3 text-sm font-medium transition active:scale-[0.97] ${
                        active
                          ? 'bg-forest-950 text-white'
                          : 'border border-forest-950/10 bg-white text-ink-muted'
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

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

        {mode === 'income' && (
          <>
            <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-wider text-ink-subtle">
              Auto-Split Vorschau
            </h2>
            <div className="mt-3 row-divider rounded-[22px] bg-white shadow-card">
              <PreviewRow
                emoji="🎉"
                label="Fun-Geld"
                pct={ruleFor(source).funPercentage}
                amount={preview?.fun ?? 0}
              />
              <PreviewRow
                emoji="🏦"
                label="Sparkonto"
                pct={ruleFor(source).savingsPercentage}
                amount={preview?.savings ?? 0}
              />
              <PreviewRow
                emoji="📈"
                label="Investment"
                pct={ruleFor(source).investmentPercentage}
                amount={preview?.investment ?? 0}
              />
            </div>

            {preview?.capApplied && (
              <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-[12px] text-amber-800">
                Notgroschen-Cap erreicht — Überschuss fließt ins Investment.
              </p>
            )}
          </>
        )}
      </div>

      <AdvisorSheet
        open={advisorOpen}
        onOpenChange={(o) => {
          setAdvisorOpen(o);
          if (!o) setActiveTab('home');
        }}
        investmentAmount={advisorAmount}
      />

      <div
        className="sticky inset-x-0 z-30 px-4 pt-3 pb-2"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 86px)' }}
      >
        <div className="absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-paper to-transparent" />
        <button
          type="button"
          onClick={() =>
            mode === 'income' ? void submitIncome() : void submitExpense()
          }
          disabled={!canSubmit}
          className="btn-primary relative w-full text-base shadow-card"
        >
          {ctaLabel}
          <ArrowRight className="ml-2 h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>
    </>
  );
}

function labelFor(t: AccountType): string {
  return t === 'fun' ? 'Fun-Geld' : t === 'savings' ? 'Sparkonto' : 'Investment';
}

function PreviewRow({
  emoji,
  label,
  pct,
  amount,
}: {
  emoji: string;
  label: string;
  pct: number;
  amount: number;
}) {
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
