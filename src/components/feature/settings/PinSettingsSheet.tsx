import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { configRepo } from '@/db/repositories/config';
import { ALL_CONFIG_KEYS } from '@/db/types';
import { hashPin, isValidPin } from '@/lib/pin';
import { useToastStore } from '@/stores/toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pinIsSet: boolean;
  onChanged: () => void;
}

type Step = 'enterCurrent' | 'enterNew' | 'confirmNew' | 'remove';

export function PinSettingsSheet({
  open,
  onOpenChange,
  pinIsSet,
  onChanged,
}: Props) {
  const [step, setStep] = useState<Step>(pinIsSet ? 'enterCurrent' : 'enterNew');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [intent, setIntent] = useState<'change' | 'remove'>('change');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pushToast = useToastStore((s) => s.push);

  useEffect(() => {
    if (open) {
      setStep(pinIsSet ? 'enterCurrent' : 'enterNew');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setError(null);
      setIntent('change');
    }
  }, [open, pinIsSet]);

  async function verifyCurrent(): Promise<boolean> {
    const stored = await configRepo.getJson<string>(
      ALL_CONFIG_KEYS.appPinHash,
    );
    if (!stored.ok || !stored.value) return false;
    const hash = await hashPin(currentPin);
    return hash === stored.value;
  }

  async function setOrChangePin() {
    setBusy(true);
    setError(null);
    if (!isValidPin(newPin) || !isValidPin(confirmPin)) {
      setError('PIN muss 4 Ziffern haben.');
      setBusy(false);
      return;
    }
    if (newPin !== confirmPin) {
      setError('PIN-Bestätigung stimmt nicht.');
      setBusy(false);
      return;
    }
    const hash = await hashPin(newPin);
    await configRepo.setJson(ALL_CONFIG_KEYS.appPinHash, hash);
    pushToast(pinIsSet ? 'PIN aktualisiert' : 'PIN aktiviert', 'success');
    onChanged();
    onOpenChange(false);
    setBusy(false);
  }

  async function removePin() {
    setBusy(true);
    setError(null);
    await configRepo.remove(ALL_CONFIG_KEYS.appPinHash);
    pushToast('PIN deaktiviert', 'success');
    onChanged();
    onOpenChange(false);
    setBusy(false);
  }

  async function handlePrimary() {
    if (step === 'enterCurrent') {
      if (!isValidPin(currentPin)) {
        setError('PIN muss 4 Ziffern haben.');
        return;
      }
      const ok = await verifyCurrent();
      if (!ok) {
        setError('Aktueller PIN falsch.');
        return;
      }
      if (intent === 'remove') await removePin();
      else setStep('enterNew');
    } else if (step === 'enterNew') {
      if (!isValidPin(newPin)) {
        setError('PIN muss 4 Ziffern haben.');
        return;
      }
      setStep('confirmNew');
    } else if (step === 'confirmNew') {
      await setOrChangePin();
    }
  }

  const title =
    step === 'enterCurrent'
      ? 'PIN bestätigen'
      : step === 'enterNew'
        ? pinIsSet
          ? 'Neuen PIN setzen'
          : 'PIN festlegen'
        : 'PIN bestätigen';

  const inputLabel =
    step === 'enterCurrent'
      ? 'Aktueller PIN'
      : step === 'enterNew'
        ? 'Neuer PIN'
        : 'PIN nochmal eingeben';

  const value =
    step === 'enterCurrent'
      ? currentPin
      : step === 'enterNew'
        ? newPin
        : confirmPin;

  const setValue = (v: string) => {
    const cleaned = v.replace(/\D/g, '').slice(0, 4);
    if (step === 'enterCurrent') setCurrentPin(cleaned);
    else if (step === 'enterNew') setNewPin(cleaned);
    else setConfirmPin(cleaned);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <div className="flex gap-2">
          {pinIsSet && step === 'enterCurrent' && (
            <button
              type="button"
              className="btn-destructive flex-1"
              onClick={() => {
                setIntent('remove');
                void handlePrimary();
              }}
              disabled={busy}
            >
              PIN deaktivieren
            </button>
          )}
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={() => void handlePrimary()}
            disabled={busy}
          >
            {step === 'confirmNew'
              ? pinIsSet
                ? 'Speichern'
                : 'Aktivieren'
              : 'Weiter'}
          </button>
        </div>
      }
    >
      <div className="space-y-4 pt-2">
        <p className="text-[12px] text-ink-subtle">
          Der PIN wird als SHA-256-Hash gespeichert (nicht im Klartext). Wenn
          du ihn vergisst, kannst du die App nur via „App zurücksetzen"
          komplett neu aufsetzen.
        </p>

        <label className="block">
          <span className="text-[13px] font-medium text-ink">{inputLabel}</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            className="input-field mt-1 text-center text-2xl tracking-widest"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="••••"
          />
        </label>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
