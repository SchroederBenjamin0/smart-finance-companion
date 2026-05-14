import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { incomeRepo } from '@/db/repositories/income';
import { transactionsRepo } from '@/db/repositories/transactions';
import type {
  AccountType,
  IncomeEntry,
  IncomeSource,
  Transaction,
} from '@/db/types';
import { formatEur } from '@/lib/currency';
import { formatDateDe } from '@/lib/date';
import { VALID_CATEGORIES } from '@/modules/categorizer';
import { useAccountsStore } from '@/stores/accounts';
import { useToastStore } from '@/stores/toast';

export type EntrySelection =
  | { kind: 'income'; entry: IncomeEntry }
  | { kind: 'expense'; transaction: Transaction };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selection: EntrySelection | null;
  onDeleted: () => void;
}

const INCOME_SOURCE_LABEL: Record<IncomeSource, string> = {
  main_job: 'Hauptjob',
  dj_gig: 'DJ-Gig',
  other: 'Sonstiges',
};

// Manuelle Ausgaben kommen nur aus Fun oder Sparkonto — alte
// 'investment'-Allokationen sind Plan-Einträge, nicht echte Account-Belastungen.
type BankAccountType = Extract<AccountType, 'fun' | 'savings'>;

const ACCOUNT_LABEL: Record<BankAccountType, string> = {
  fun: 'Fun-Geld',
  savings: 'Sparkonto',
};

export function EntryDetailsSheet({
  open,
  onOpenChange,
  selection,
  onDeleted,
}: Props) {
  const [deleting, setDeleting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [account, setAccount] = useState<BankAccountType>('fun');
  const [editing, setEditing] = useState(false);
  const [editCounterparty, setEditCounterparty] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const reloadAccounts = useAccountsStore((s) => s.load);
  const pushToast = useToastStore((s) => s.push);

  // Reset edit mode when the sheet closes
  useEffect(() => {
    if (!open) setEditing(false);
  }, [open]);

  const startEdit = () => {
    if (!selection || selection.kind !== 'expense') return;
    const t = selection.transaction;
    setEditCounterparty(t.counterparty);
    setEditCategory(t.category);
    setEditDate(t.date);
    setEditDescription(t.description ?? '');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!selection || selection.kind !== 'expense') return;
    if (!editCounterparty.trim()) {
      pushToast('Empfänger darf nicht leer sein', 'error');
      return;
    }
    setSaving(true);
    const r = await transactionsRepo.updateAnnotation(selection.transaction.id, {
      counterparty: editCounterparty.trim(),
      category: editCategory.trim() || 'sonstiges',
      date: editDate,
      description: editDescription.trim() || null,
    });
    setSaving(false);
    if (!r.ok) {
      pushToast(`Fehler: ${r.error.message}`, 'error');
      return;
    }
    pushToast('Eintrag aktualisiert ✓', 'success');
    setEditing(false);
    onDeleted(); // reuse parent's "reload data" callback
    onOpenChange(false);
  };

  async function handleDelete() {
    if (!selection) return;
    if (selection.kind === 'income') {
      const ok = window.confirm(
        `Eintrag löschen? Die Aufteilung (Fun/Spar/Invest) wird zurückgebucht.`,
      );
      if (!ok) return;
      setDeleting(true);
      const r = await incomeRepo.deleteWithAllocations(selection.entry.id);
      if (!r.ok) {
        pushToast(`Fehler: ${r.error.message}`, 'error');
      } else {
        pushToast('Einnahme gelöscht', 'success');
        await reloadAccounts();
        onDeleted();
        onOpenChange(false);
      }
      setDeleting(false);
    } else {
      // For expenses we need to know which account it came from to reverse it.
      // Manual expenses don't store this — we ask the user.
      setPicking(true);
    }
  }

  async function confirmExpenseDelete() {
    if (!selection || selection.kind !== 'expense') return;
    setDeleting(true);
    const r = await transactionsRepo.deleteWithReversal(
      selection.transaction.id,
      account,
    );
    if (!r.ok) {
      pushToast(`Fehler: ${r.error.message}`, 'error');
    } else {
      pushToast('Eintrag gelöscht', 'success');
      await reloadAccounts();
      onDeleted();
      onOpenChange(false);
    }
    setDeleting(false);
    setPicking(false);
  }

  if (!selection) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={selection.kind === 'income' ? 'Einnahme' : 'Ausgabe'}
      footer={
        selection.kind === 'expense' && editing ? (
          <div className="flex w-full gap-2">
            <button
              type="button"
              className="flex-1 rounded-full bg-paper px-4 py-2 text-[15px] font-medium text-ink"
              onClick={cancelEdit}
              disabled={saving}
            >
              Abbrechen
            </button>
            <button
              type="button"
              className="flex-1 rounded-full bg-forest-700 px-4 py-2 text-[15px] font-semibold text-white"
              onClick={() => void saveEdit()}
              disabled={saving}
            >
              {saving ? 'Speichert…' : 'Speichern'}
            </button>
          </div>
        ) : picking ? (
          <button
            type="button"
            className="btn-destructive w-full"
            onClick={() => void confirmExpenseDelete()}
            disabled={deleting}
          >
            <Trash2 className="mr-2 h-4 w-4" strokeWidth={2.5} />
            {deleting ? 'Lösche…' : `Löschen & ${ACCOUNT_LABEL[account]} gutschreiben`}
          </button>
        ) : selection.kind === 'expense' ? (
          <div className="flex w-full gap-2">
            <button
              type="button"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-paper px-4 py-2 text-[15px] font-medium text-ink"
              onClick={startEdit}
            >
              <Pencil className="h-4 w-4" strokeWidth={2} />
              Bearbeiten
            </button>
            <button
              type="button"
              className="btn-destructive flex-1"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              <Trash2 className="mr-2 h-4 w-4" strokeWidth={2.5} />
              {deleting ? 'Lösche…' : 'Löschen'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-destructive w-full"
            onClick={() => void handleDelete()}
            disabled={deleting}
          >
            <Trash2 className="mr-2 h-4 w-4" strokeWidth={2.5} />
            {deleting ? 'Lösche…' : 'Eintrag löschen'}
          </button>
        )
      }
    >
      <div className="space-y-4 pt-2">
        {selection.kind === 'expense' && editing ? (
          <ExpenseEditForm
            counterparty={editCounterparty}
            category={editCategory}
            date={editDate}
            description={editDescription}
            onCounterpartyChange={setEditCounterparty}
            onCategoryChange={setEditCategory}
            onDateChange={setEditDate}
            onDescriptionChange={setEditDescription}
            amount={selection.transaction.amount}
          />
        ) : selection.kind === 'income' ? (
          <IncomeDetails entry={selection.entry} />
        ) : (
          <ExpenseDetails transaction={selection.transaction} />
        )}

        {picking && selection.kind === 'expense' && !editing && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-[12px] font-medium text-amber-800">
              Aus welchem Konto kam die Ausgabe? Der Betrag wird dort wieder
              gutgeschrieben.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['fun', 'savings'] as BankAccountType[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAccount(a)}
                  className={`rounded-xl border px-3 py-2 text-[12px] font-semibold transition active:scale-[0.97] ${
                    account === a
                      ? 'border-forest-950 bg-forest-950 text-white'
                      : 'border-forest-950/15 bg-surface text-ink'
                  }`}
                >
                  {ACCOUNT_LABEL[a]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function IncomeDetails({ entry }: { entry: IncomeEntry }) {
  return (
    <div className="space-y-3">
      <Field label="Betrag">
        <span className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
          +{formatEur(entry.amount)}
        </span>
      </Field>
      <Field label="Quelle">
        {INCOME_SOURCE_LABEL[entry.source]}
      </Field>
      <Field label="Datum">{formatDateDe(entry.date)}</Field>
      {entry.note && <Field label="Notiz">{entry.note}</Field>}
      <Field label="Klassifikation">
        <span className="rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-medium text-ink-muted">
          {entry.classification}
        </span>
      </Field>
    </div>
  );
}

function ExpenseDetails({ transaction }: { transaction: Transaction }) {
  return (
    <div className="space-y-3">
      <Field label="Betrag">
        <span className="text-2xl font-semibold tabular-nums text-red-700 dark:text-red-400">
          {formatEur(transaction.amount)}
        </span>
      </Field>
      <Field label="Empfänger">{transaction.counterparty}</Field>
      <Field label="Kategorie">{transaction.category}</Field>
      <Field label="Datum">{formatDateDe(transaction.date)}</Field>
      {transaction.description && (
        <Field label="Notiz">{transaction.description}</Field>
      )}
    </div>
  );
}

function ExpenseEditForm({
  counterparty,
  category,
  date,
  description,
  amount,
  onCounterpartyChange,
  onCategoryChange,
  onDateChange,
  onDescriptionChange,
}: {
  counterparty: string;
  category: string;
  date: string;
  description: string;
  amount: number;
  onCounterpartyChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onDateChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Betrag">
        <span className="text-2xl font-semibold tabular-nums text-red-700 dark:text-red-400">
          {formatEur(amount)}
        </span>
      </Field>
      <label className="block">
        <span className="text-[12px] font-medium text-ink-subtle">Empfänger</span>
        <input
          type="text"
          className="input-field mt-1"
          value={counterparty}
          onChange={(e) => onCounterpartyChange(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-[12px] font-medium text-ink-subtle">Kategorie</span>
        <select
          className="input-field mt-1"
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
        >
          {VALID_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[12px] font-medium text-ink-subtle">Datum</span>
        <input
          type="date"
          className="input-field mt-1"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-[12px] font-medium text-ink-subtle">Notiz</span>
        <input
          type="text"
          className="input-field mt-1"
          placeholder="optional"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
        />
      </label>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] font-medium text-ink-subtle">{label}</span>
      <span className="text-[14px] font-medium text-ink">{children}</span>
    </div>
  );
}
