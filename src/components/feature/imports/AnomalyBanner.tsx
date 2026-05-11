import type { AnomalyResult } from '@/modules/anomaly';

interface Props {
  anomalies: AnomalyResult[];
  onDismiss: () => void;
}

export function AnomalyBanner({ anomalies, onDismiss }: Props) {
  if (anomalies.length === 0) return null;
  return (
    <div className="mb-4 rounded-[16px] border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-amber-900">
            ⚠️ {anomalies.length} auffällige {anomalies.length === 1 ? 'Ausgabe' : 'Ausgaben'} erkannt
          </div>
          <div className="mt-1 text-[12px] text-amber-800">
            {anomalies.slice(0, 3).map((a) =>
              `${Math.abs(a.amount).toFixed(2)} € (${a.factor.toFixed(1)}× Median)`
            ).join(', ')}
            {anomalies.length > 3 ? ` und ${anomalies.length - 3} weitere` : ''}
          </div>
        </div>
        <button type="button" onClick={onDismiss} className="text-[12px] text-amber-700">Schließen</button>
      </div>
    </div>
  );
}
