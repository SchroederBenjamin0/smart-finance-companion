import { useEffect, useRef, useState } from 'react';
import { Archive, CheckCircle2, HandCoins, Package, Pencil, Plus, Trash2, User } from 'lucide-react';
import { getDB } from '@/db/client';
import { accountsRepo } from '@/db/repositories/accounts';
import { loansRepo } from '@/db/repositories/loans';
import type { Loan, LoanPaymentMethod, Transaction } from '@/db/types';
import { computeTransactionHash } from '@/lib/hash';
import { generateId } from '@/lib/id';
import { todayIso } from '@/lib/date';
import { formatEur, parseEurInput } from '@/lib/currency';
import { buildReturnTransaction } from '@/modules/loans';
import { useToastStore } from '@/stores/toast';

// ---------------------------------------------------------------------------
// Transfer-return write path (atomic 3-store IDB transaction)
// ---------------------------------------------------------------------------

async function handleTransferReturn(loan: Loan): Promise<void> {
  const draft = buildReturnTransaction(loan, new Date());
  const hash = await computeTransactionHash({
    date: draft.date,
    amount: draft.amount,
    counterparty: draft.counterparty,
  });
  const transaction: Transaction = { ...draft, transactionHash: hash, isAnomaly: 0 };

  const accountsR = await accountsRepo.findAll();
  if (!accountsR.ok) throw new Error('Konten konnten nicht geladen werden');
  const fun = accountsR.value.find((a) => a.type === 'fun');
  if (!fun) throw new Error('Fun-Konto nicht gefunden');

  const db = await getDB();
  const tx = db.transaction(['transactions', 'accounts', 'loans'], 'readwrite');
  await tx.objectStore('transactions').put(transaction);
  await tx.objectStore('accounts').put({
    ...fun,
    balance: Math.round((fun.balance + draft.amount) * 100) / 100,
    lastUpdated: new Date().toISOString(),
  });
  await tx.objectStore('loans').put({
    ...loan,
    status: 'returned',
    returnedAt: new Date().toISOString(),
  });
  await tx.done;
}

// ---------------------------------------------------------------------------
// Cash/no-amount return path (simple status flip)
// ---------------------------------------------------------------------------

async function handleCashReturn(loan: Loan): Promise<void> {
  await loansRepo.upsert({
    ...loan,
    status: 'returned',
    returnedAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// TransferReturnConfirm
// ---------------------------------------------------------------------------

interface TransferReturnConfirmProps {
  loan: Loan;
  onClose: () => void;
  onConfirmed: () => void;
}

function TransferReturnConfirm({ loan, onClose, onConfirmed }: TransferReturnConfirmProps) {
  const pushToast = useToastStore((s) => s.push);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await handleTransferReturn(loan);
      pushToast('Rückzahlung verbucht auf Fun-Konto ✓', 'success');
      onConfirmed();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Fehler beim Verbuchen', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-950/40 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-t-[28px] bg-paper px-5 pb-8 pt-5 shadow-nav">
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-forest-950/15" />
        <h2 className="mb-2 text-lg font-semibold text-ink">Überweisung bestätigen</h2>
        <p className="mb-1 text-[14px] text-ink">
          Hat <span className="font-semibold">{loan.borrowerName}</span> die{' '}
          {loan.amount !== undefined && (
            <span className="font-semibold">{formatEur(loan.amount)}</span>
          )}{' '}
          überwiesen?
        </p>
        <p className="mb-5 text-[13px] text-ink-subtle">
          Der Betrag wird auf dein Fun-Konto gebucht.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-full border border-forest-950/15 bg-surface px-4 py-2 text-[15px] font-medium text-ink"
            onClick={onClose}
            disabled={busy}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="flex-1 rounded-full bg-forest-700 px-4 py-2 text-[15px] font-semibold text-white"
            onClick={() => void confirm()}
            disabled={busy}
          >
            {busy ? 'Buche…' : 'Ja, verbuchen'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LoanFormModal
// ---------------------------------------------------------------------------

interface LoanFormModalProps {
  loan?: Loan;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function LoanFormModal({ loan, open, onClose, onSaved }: LoanFormModalProps) {
  const pushToast = useToastStore((s) => s.push);

  const [borrowerName, setBorrowerName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [lentAt, setLentAt] = useState(todayIso());
  const [hasAmount, setHasAmount] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<LoanPaymentMethod>('transfer');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ borrowerName?: string; itemDescription?: string; amount?: string }>({});
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      if (loan) {
        setBorrowerName(loan.borrowerName);
        setItemDescription(loan.itemDescription);
        setLentAt(loan.lentAt);
        setHasAmount(loan.amount !== undefined && loan.amount > 0);
        setAmountText(loan.amount ? String(loan.amount) : '');
        setPaymentMethod(loan.paymentMethod ?? 'transfer');
      } else {
        setBorrowerName('');
        setItemDescription('');
        setLentAt(todayIso());
        setHasAmount(false);
        setAmountText('');
        setPaymentMethod('transfer');
      }
      setErrors({});
      // Focus name field after a short delay for animation to settle
      setTimeout(() => nameRef.current?.focus(), 100);
    }
  }, [open, loan]);

  function validate(): boolean {
    const newErrors: typeof errors = {};
    if (!borrowerName.trim()) newErrors.borrowerName = 'Name erforderlich';
    if (!itemDescription.trim()) newErrors.itemDescription = 'Beschreibung erforderlich';
    if (hasAmount) {
      const n = parseEurInput(amountText);
      if (n === null || n <= 0) newErrors.amount = 'Gültigen Betrag eingeben';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setBusy(true);
    const parsedAmount = hasAmount ? (parseEurInput(amountText) ?? undefined) : undefined;
    const next: Loan = {
      id: loan?.id ?? generateId(),
      borrowerName: borrowerName.trim(),
      itemDescription: itemDescription.trim(),
      lentAt,
      amount: parsedAmount,
      paymentMethod: hasAmount ? paymentMethod : undefined,
      status: loan?.status ?? 'lent',
      returnedAt: loan?.returnedAt,
      createdAt: loan?.createdAt ?? new Date().toISOString(),
    };
    const r = await loansRepo.upsert(next);
    if (r.ok) {
      pushToast(loan ? 'Verleih aktualisiert ✓' : 'Verleih gespeichert ✓', 'success');
      onSaved();
    } else {
      pushToast('Fehler beim Speichern', 'error');
    }
    setBusy(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-950/40 backdrop-blur-[2px]">
      <div className="flex w-full max-w-lg flex-col rounded-t-[28px] bg-paper shadow-nav">
        <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-forest-950/15" />
        <header className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-lg font-semibold text-ink">
            {loan ? 'Verleih bearbeiten' : 'Verleih erfassen'}
          </h2>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full bg-surface text-ink shadow-card"
            onClick={onClose}
            aria-label="Schließen"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="space-y-4">
            {/* Borrower name */}
            <label className="block">
              <span className="text-[13px] font-medium text-ink">
                Name <span className="text-red-500">*</span>
              </span>
              <input
                ref={nameRef}
                type="text"
                autoComplete="off"
                className="input-field mt-1"
                placeholder="z. B. Sarah"
                value={borrowerName}
                onChange={(e) => setBorrowerName(e.target.value)}
              />
              {errors.borrowerName && (
                <p className="mt-1 text-[12px] text-red-600">{errors.borrowerName}</p>
              )}
            </label>

            {/* Item description */}
            <label className="block">
              <span className="text-[13px] font-medium text-ink">
                Was verliehen? <span className="text-red-500">*</span>
              </span>
              <input
                type="text"
                autoComplete="off"
                className="input-field mt-1"
                placeholder="z. B. Kamera, 50 €, Buch"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
              />
              {errors.itemDescription && (
                <p className="mt-1 text-[12px] text-red-600">{errors.itemDescription}</p>
              )}
            </label>

            {/* Date */}
            <label className="block">
              <span className="text-[13px] font-medium text-ink">Datum</span>
              <input
                type="date"
                className="input-field mt-1"
                value={lentAt}
                onChange={(e) => setLentAt(e.target.value)}
              />
            </label>

            {/* "Geld zurück" toggle */}
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-forest-950/10 bg-surface px-4 py-3">
              <input
                type="checkbox"
                className="h-4 w-4 accent-forest-700"
                checked={hasAmount}
                onChange={(e) => setHasAmount(e.target.checked)}
              />
              <span className="text-[14px] font-medium text-ink">
                Geld erwarte ich zurück
              </span>
            </label>

            {/* Amount + method — revealed when hasAmount */}
            {hasAmount && (
              <div className="space-y-3 rounded-xl border border-forest-950/10 bg-surface px-4 py-3">
                <label className="block">
                  <span className="text-[13px] font-medium text-ink">Betrag (€)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    className="input-field mt-1 tabular-nums"
                    placeholder="z. B. 50,00"
                    value={amountText}
                    onChange={(e) => setAmountText(e.target.value)}
                  />
                  {errors.amount && (
                    <p className="mt-1 text-[12px] text-red-600">{errors.amount}</p>
                  )}
                </label>

                <fieldset>
                  <legend className="mb-2 text-[13px] font-medium text-ink">
                    Rückzahlungsart
                  </legend>
                  <div className="flex gap-3">
                    {(['transfer', 'cash'] as LoanPaymentMethod[]).map((m) => (
                      <label key={m} className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={m}
                          className="accent-forest-700"
                          checked={paymentMethod === m}
                          onChange={() => setPaymentMethod(m)}
                        />
                        <span className="text-[14px] text-ink">
                          {m === 'transfer' ? 'Überweisung' : 'Bar'}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}
          </div>
        </div>

        <div
          className="border-t border-forest-950/10 bg-surface/95 px-5 py-3 backdrop-blur"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        >
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-full border border-forest-950/15 bg-surface px-4 py-2 text-[15px] font-medium text-ink"
              onClick={onClose}
              disabled={busy}
            >
              Abbrechen
            </button>
            <button
              type="button"
              className="flex-1 rounded-full bg-forest-700 px-4 py-2 text-[15px] font-semibold text-white"
              onClick={() => void save()}
              disabled={busy}
            >
              {busy ? 'Speichert…' : loan ? 'Speichern' : 'Hinzufügen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LoanRow
// ---------------------------------------------------------------------------

interface LoanRowProps {
  loan: Loan;
  onEdit: () => void;
  onReturn: () => void;
  onDelete: () => void;
}

function LoanRow({ loan, onEdit, onReturn, onDelete }: LoanRowProps) {
  const isOpen = loan.status === 'lent';

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {/* Icon */}
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200">
        <Package className="h-4.5 w-4.5" strokeWidth={2.25} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-ink">
            {loan.borrowerName}
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              isOpen
                ? 'bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200'
                : 'bg-paper text-ink-subtle'
            }`}
          >
            {isOpen ? 'verliehen' : 'zurück'}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[13px] text-ink-muted">
          {loan.itemDescription}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-subtle">
          <span>{loan.lentAt.slice(0, 10).split('-').reverse().join('.')}</span>
          {loan.amount !== undefined && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{formatEur(loan.amount)}</span>
              {loan.paymentMethod && (
                <>
                  <span aria-hidden>·</span>
                  <span>{loan.paymentMethod === 'transfer' ? 'Überweisung' : 'Bar'}</span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        {isOpen && (
          <>
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-full text-forest-700 transition active:bg-forest-50"
              onClick={onReturn}
              aria-label="Als zurückgegeben markieren"
            >
              <CheckCircle2 className="h-4.5 w-4.5" strokeWidth={2.25} />
            </button>
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle transition active:bg-paper"
              onClick={onEdit}
              aria-label="Bearbeiten"
            >
              <Pencil className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </>
        )}
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-full text-red-400 transition active:bg-red-50"
          onClick={onDelete}
          aria-label="Löschen"
        >
          <Trash2 className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReturnedLoansModal — pop-up listing the already-returned items
// ---------------------------------------------------------------------------

interface ReturnedLoansModalProps {
  loans: Loan[];
  onClose: () => void;
  onDelete: (loan: Loan) => void;
}

function ReturnedLoansModal({ loans, onClose, onDelete }: ReturnedLoansModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-950/40 backdrop-blur-[2px]">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-t-[28px] bg-paper shadow-nav">
        <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-forest-950/15" />
        <header className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-lg font-semibold text-ink">
            Zurückerhalten ({loans.length})
          </h2>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full bg-surface text-ink shadow-card"
            onClick={onClose}
            aria-label="Schließen"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </header>
        <div
          className="row-divider flex-1 overflow-y-auto"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        >
          {loans.length === 0 ? (
            <p className="px-5 py-8 text-center text-[14px] text-ink-subtle">
              Noch nichts zurückerhalten.
            </p>
          ) : (
            loans.map((loan) => (
              <LoanRow
                key={loan.id}
                loan={loan}
                onEdit={() => {}}
                onReturn={() => {}}
                onDelete={() => onDelete(loan)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LoansSection (main export)
// ---------------------------------------------------------------------------

export function LoansSection() {
  const pushToast = useToastStore((s) => s.push);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | undefined>(undefined);
  const [returnLoan, setReturnLoan] = useState<Loan | undefined>(undefined);
  const [showReturned, setShowReturned] = useState(false);

  const open = loans.filter((l) => l.status === 'lent');
  const returned = loans.filter((l) => l.status === 'returned');

  async function load() {
    setLoading(true);
    const r = await loansRepo.findAll();
    if (r.ok) setLoans(r.value);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function openAdd() {
    setEditingLoan(undefined);
    setFormOpen(true);
  }

  function openEdit(loan: Loan) {
    setEditingLoan(loan);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingLoan(undefined);
  }

  async function onFormSaved() {
    closeForm();
    await load();
  }

  function handleReturnClick(loan: Loan) {
    // If no amount OR cash payment → simple flip
    if (!loan.amount || loan.amount <= 0 || loan.paymentMethod !== 'transfer') {
      void (async () => {
        await handleCashReturn(loan);
        pushToast('Als zurückgegeben markiert ✓', 'success');
        await load();
      })();
    } else {
      // Transfer path → open confirm modal
      setReturnLoan(loan);
    }
  }

  async function onTransferConfirmed() {
    setReturnLoan(undefined);
    await load();
  }

  async function deleteLoan(loan: Loan) {
    const ok = window.confirm(
      `Verleih an "${loan.borrowerName}" (${loan.itemDescription}) löschen?`,
    );
    if (!ok) return;
    const r = await loansRepo.delete(loan.id);
    if (r.ok) {
      pushToast('Verleih gelöscht', 'success');
      await load();
    } else {
      pushToast('Fehler beim Löschen', 'error');
    }
  }

  return (
    <>
      <div className="mt-5">
        <div className="mb-2 ml-1 flex items-center justify-between">
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-subtle">
            Verleih
          </h2>
          <button
            type="button"
            className="flex items-center gap-1 rounded-full bg-forest-700 px-3 py-1 text-[12px] font-semibold text-white"
            onClick={openAdd}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            Neu
          </button>
        </div>

        <div className="row-divider overflow-hidden rounded-[22px] bg-surface shadow-card">
          {loading ? (
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200">
                <HandCoins className="h-4.5 w-4.5" strokeWidth={2.25} />
              </div>
              <span className="text-[14px] text-ink-subtle">Lade…</span>
            </div>
          ) : loans.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200">
                <HandCoins className="h-5 w-5" strokeWidth={2.25} />
              </div>
              <p className="text-[14px] font-medium text-ink">Noch keine Verleihungen</p>
              <p className="text-[12px] text-ink-subtle">
                Tippe auf „Neu", um eine Verleihung zu erfassen.
              </p>
            </div>
          ) : (
            <>
              {/* Open loans only — returned ones live behind the button below */}
              {open.length > 0 ? (
                open.map((loan) => (
                  <LoanRow
                    key={loan.id}
                    loan={loan}
                    onEdit={() => openEdit(loan)}
                    onReturn={() => handleReturnClick(loan)}
                    onDelete={() => void deleteLoan(loan)}
                  />
                ))
              ) : (
                <div className="px-4 py-5 text-center text-[13px] text-ink-subtle">
                  Keine offenen Verleihungen.
                </div>
              )}

              {/* Returned-items viewer — opens a pop-up */}
              {returned.length > 0 && (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-paper"
                  onClick={() => setShowReturned(true)}
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-paper text-ink-muted">
                    <Archive className="h-4.5 w-4.5" strokeWidth={2.25} />
                  </div>
                  <span className="flex-1 text-[14px] font-medium text-ink">
                    Zurückerhalten ansehen
                  </span>
                  <span className="rounded-full bg-paper px-2 py-0.5 text-[12px] font-semibold tabular-nums text-ink-subtle">
                    {returned.length}
                  </span>
                </button>
              )}

              {/* "Add" row */}
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-paper"
                onClick={openAdd}
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200">
                  <User className="h-4.5 w-4.5" strokeWidth={2.25} />
                </div>
                <span className="text-[14px] font-medium text-forest-700">
                  + Neue Verleihung
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Form modal */}
      <LoanFormModal
        loan={editingLoan}
        open={formOpen}
        onClose={closeForm}
        onSaved={() => void onFormSaved()}
      />

      {/* Transfer-return confirm */}
      {returnLoan && (
        <TransferReturnConfirm
          loan={returnLoan}
          onClose={() => setReturnLoan(undefined)}
          onConfirmed={() => void onTransferConfirmed()}
        />
      )}

      {/* Returned-loans pop-up */}
      {showReturned && (
        <ReturnedLoansModal
          loans={returned}
          onClose={() => setShowReturned(false)}
          onDelete={(loan) => void deleteLoan(loan)}
        />
      )}
    </>
  );
}
