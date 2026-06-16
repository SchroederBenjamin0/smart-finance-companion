import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  runBacktest,
  type BacktestAllocation,
  type BacktestResult,
} from '@/modules/backtest';
import { useChartColors } from '@/lib/chart-colors';

interface Props {
  allocation: BacktestAllocation[];
  monthlyContribution: number;
  years?: number;
}

export function BacktestPanel({
  allocation,
  monthlyContribution,
  years = 10,
}: Props) {
  const colors = useChartColors();
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      const r = await runBacktest({ allocation, monthlyContribution, years });
      if (r.ok) {
        setResult(r.value);
      } else {
        setError(r.error.message);
      }
      setLoading(false);
    })();
  }, [allocation, monthlyContribution, years]);

  if (loading) {
    return (
      <div className="card text-center text-body text-ink-subtle">
        Berechne Backtest...
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="rounded-card bg-amber-50 p-4 text-label text-amber-900">
        Backtest nicht möglich: {error ?? 'Keine Daten'}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="text-body font-semibold text-ink">
        Hypothetische Entwicklung — letzte {years} Jahre
      </div>
      <div className="mt-1 text-caption text-ink-subtle">
        Vergangenheitsdaten. Keine Prognose. Märkte können sich anders verhalten.
      </div>

      <div className="mt-3 h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={result.series}>
            <XAxis dataKey="date" hide />
            <YAxis hide />
            <Tooltip
              formatter={(value: number) => [`${value.toFixed(0)} €`, 'Portfoliowert']}
              labelFormatter={() => ''}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              }}
            />
            <ReferenceLine
              y={result.totalContributed}
              stroke={colors.reference}
              strokeDasharray="4 4"
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={colors.primary}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-chip bg-paper p-3">
          <div className="text-caption text-ink-subtle">Endwert</div>
          <div className="text-heading font-semibold text-ink tabular-nums">
            {result.endValue.toFixed(0)} €
          </div>
          <div className="text-caption text-ink-subtle">
            Eingezahlt: {result.totalContributed.toFixed(0)} €
          </div>
        </div>
        <div className="rounded-chip bg-paper p-3">
          <div className="text-caption text-ink-subtle">Max Drawdown</div>
          <div className="text-heading font-semibold text-red-700 tabular-nums">
            -{(result.maxDrawdown * 100).toFixed(0)} %
          </div>
          <div className="text-caption text-ink-subtle">
            Schlimmster Drawdown im Zeitraum
          </div>
        </div>
      </div>
    </div>
  );
}
