import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { hashPin } from '@/lib/pin';

interface Props {
  expectedHash: string;
  onUnlock: () => void;
}

export function PinGate({ expectedHash, onUnlock }: Props) {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleChange(value: string) {
    const cleaned = value.replace(/\D/g, '').slice(0, 4);
    setDigits(cleaned);
    setError(null);
    if (cleaned.length === 4) {
      const hash = await hashPin(cleaned);
      if (hash === expectedHash) {
        onUnlock();
      } else {
        setError('Falscher PIN');
        setShaking(true);
        setTimeout(() => {
          setShaking(false);
          setDigits('');
        }, 500);
      }
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-paper px-6">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-forest-950 text-white">
        <Lock className="h-7 w-7" strokeWidth={2.25} />
      </div>
      <h1 className="mt-4 text-2xl font-semibold text-ink">App entsperren</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Tippe deinen 4-stelligen PIN
      </p>

      <div
        className={`mt-8 flex gap-3 ${shaking ? 'animate-pulse' : ''}`}
        style={shaking ? { animation: 'shake 0.4s' } : undefined}
      >
        {[0, 1, 2, 3].map((i) => {
          const filled = i < digits.length;
          return (
            <div
              key={i}
              className={`grid h-14 w-14 place-items-center rounded-2xl border-2 text-2xl font-semibold tabular-nums ${
                filled
                  ? 'border-forest-950 bg-forest-950 text-white'
                  : 'border-forest-950/15 bg-surface text-ink-subtle'
              }`}
            >
              {filled ? '•' : ''}
            </div>
          );
        })}
      </div>

      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        className="absolute h-1 w-1 opacity-0"
        value={digits}
        onChange={(e) => void handleChange(e.target.value)}
        aria-label="4-stelliger PIN"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.focus()}
        className="btn-primary mt-8 px-8"
      >
        Tastatur öffnen
      </button>

      {error && (
        <p className="mt-4 text-sm text-red-700">{error}</p>
      )}

      <p className="mt-6 text-[12px] text-ink-subtle">
        PIN vergessen? Settings → App zurücksetzen (löscht alle Daten).
      </p>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
