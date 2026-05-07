import { useState } from 'react';

interface Props {
  emergencyFundTarget: number;
  onChange: (n: number) => void;
  onNext: () => void;
  onBack: () => void;
}

export function EmergencyFundStep({
  emergencyFundTarget,
  onChange,
  onNext,
  onBack,
}: Props) {
  const [text, setText] = useState(String(emergencyFundTarget));

  const commit = () => {
    const n = Number(text.replace(',', '.'));
    if (Number.isFinite(n) && n >= 0) onChange(Math.round(n));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <h2 className="text-2xl font-semibold">Notgroschen-Ziel</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Wie hoch soll dein Notgroschen sein? Faustregel: 3 Monatsausgaben.
        </p>

        <div className="mt-6">
          <label
            htmlFor="emergency-fund"
            className="text-sm font-medium text-ink"
          >
            Ziel-Betrag (€)
          </label>
          <input
            id="emergency-fund"
            type="number"
            inputMode="decimal"
            min="0"
            step="100"
            className="input-field mt-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
          />
          <p className="mt-2 text-xs text-ink-subtle">
            Sobald das Sparkonto diesen Wert erreicht, fließen Spar-Anteile
            ins Investment-Konto.
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <button className="btn-secondary flex-1" onClick={onBack}>
          Zurück
        </button>
        <button
          className="btn-primary flex-1"
          onClick={() => {
            commit();
            onNext();
          }}
        >
          Weiter
        </button>
      </div>
    </div>
  );
}
