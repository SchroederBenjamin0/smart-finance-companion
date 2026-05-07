import { useEffect, useState } from 'react';
import { Bell, ChevronRight } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { subscriptionsRepo } from '@/db/repositories/subscriptions';
import { transactionsRepo } from '@/db/repositories/transactions';
import type { AccountType, Subscription } from '@/db/types';
import {
  advanceCycle,
  findDueSubscriptions,
} from '@/modules/subscriptions/dueDetector';
import { formatEur } from '@/lib/currency';
import { formatDateDe } from '@/lib/date';
import { useAccountsStore } from '@/stores/accounts';
import { useToastStore } from '@/stores/toast';

const ACCOUNT_LABEL: Record<AccountType, string> = {
  fun: 'Fun-Geld',
  savings: 'Sparkonto',
  investment: 'Investment',
};

export function DueSubscriptionsBanner() {
  const [due, setDue] = useState<Subscription[]>([]);
  const [open, setOpen] = useState(false);
  const reloadAccounts = useAccountsStore((s) => s.load);
  const pushToast = useToastStore((s) => s.push);

  const reload = async () => {
    const r = await subscriptionsRepo.findActive();
    if (r.ok) setDue(findDueSubscriptions(r.value));
  };

  useEffect(() => {
    void reload();
  }, []);

  if (due.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-800 shadow-card transition active:scale-[0.99]"
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-200 text-amber-900">
          <Bell className="h-4 w-4" strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {due.length} Subscription{due.length === 1 ? '' : 's'} fällig
          </div>
          <div className="text-[12px] text-amber-700">
            {due
              .slice(0, 2)
              .map((s) => s.name)
              .join(', ')}
            {due.length > 2 && ` · +${due.length - 2}`}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-amber-700" strokeWidth={2.5} />
      </button>

      <DueSubscriptionsSheet
        open={open}
        onOpenChange={setOpen}
        due={due}
        onProcessed={async () => {
          await Promise.all([reload(), reloadAccounts()]);
        }}
        pushToast={pushToast}
      />
    </>
  );
}

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  due: Subscription[];
  onProcessed: () => Promise<void>;
  pushToast: (msg: string, variant?: 'success' | 'error' | 'info') => void;
}

function DueSubscriptionsSheet({
  open,
  onOpenChange,
  due,
  onProcessed,
  pushToast,
}: SheetProps) {
  const [accountFor, setAccountFor] = useState<Record<string, AccountType>>(
    {},
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  function getAccount(s: Subscription): AccountType {
    return accountFor[s.id] ?? 'fun';
  }

  async function debit(s: Subscription) {
    setBusyId(s.id);
    const fromAccount = getAccount(s);
    const r = await transactionsRepo.createManualExpense({
      amount: s.amount,
      counterparty: s.name,
      category: s.category,
      date: s.nextBillDate.slice(0, 10),
      note: `Auto-Debit Subscription`,
      fromAccount,
    });
    if (!r.ok) {
      pushToast(`Fehler: ${r.error.message}`, 'error');
      setBusyId(null);
      return;
    }
    const next = advanceCycle(s);
    const u = await subscriptionsRepo.upsert(next);
    if (!u.ok) {
      pushToast(`Sub-Update fehlgeschlagen: ${u.error.message}`, 'error');
    } else {
      pushToast(
        `${s.name} ${formatEur(s.amount)} aus ${ACCOUNT_LABEL[fromAccount]}`,
        'success',
      );
    }
    setBusyId(null);
    await onProcessed();
  }

  async function skip(s: Subscription) {
    // Skipping for now just bumps nextBillDate forward by one cycle
    // without recording a transaction. Useful when the bill was paid
    // some other way or the user wants to dismiss.
    setBusyId(s.id);
    const next = advanceCycle(s);
    const u = await subscriptionsRepo.upsert(next);
    if (!u.ok) {
      pushToast(`Fehler: ${u.error.message}`, 'error');
    } else {
      pushToast(`${s.name} übersprungen`, 'info');
    }
    setBusyId(null);
    await onProcessed();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Fällige Subscriptions"
    >
      <div className="space-y-3 pb-2">
        <p className="text-[12px] text-ink-subtle">
          Bei „Abbuchen" wird der Betrag aus dem gewählten Konto abgezogen
          und als Ausgabe erfasst. Die nächste Fälligkeit wird einen Zyklus
          weiter gesetzt.
        </p>
        {due.map((s) => {
          const account = getAccount(s);
          const isBusy = busyId === s.id;
          return (
            <div
              key={s.id}
              className="rounded-2xl border border-forest-950/10 bg-white p-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-ink">
                    {s.name}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-subtle">
                    Fällig {formatDateDe(s.nextBillDate)} · {s.category}
                  </div>
                </div>
                <div className="text-[14px] font-semibold tabular-nums text-ink">
                  −{formatEur(s.amount)}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {(['fun', 'savings', 'investment'] as AccountType[]).map(
                  (a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() =>
                        setAccountFor((m) => ({ ...m, [s.id]: a }))
                      }
                      className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition active:scale-[0.97] ${
                        account === a
                          ? 'border-forest-950 bg-forest-950 text-white'
                          : 'border-forest-950/15 bg-white text-ink-muted'
                      }`}
                    >
                      {ACCOUNT_LABEL[a]}
                    </button>
                  ),
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="btn-secondary h-10 flex-1 text-sm"
                  onClick={() => void skip(s)}
                  disabled={isBusy}
                >
                  Überspringen
                </button>
                <button
                  type="button"
                  className="btn-primary h-10 flex-1 text-sm"
                  onClick={() => void debit(s)}
                  disabled={isBusy}
                >
                  {isBusy ? '…' : 'Abbuchen'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
