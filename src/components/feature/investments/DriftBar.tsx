interface Props {
  currentWeight: number; // 0..100 (as %)
  targetWeight: number;  // 0..100 (as %)
  tolerancePp: number;   // pp, e.g. 5
}

export function DriftBar({ currentWeight, targetWeight, tolerancePp }: Props) {
  if (targetWeight <= 0) {
    return (
      <div className="text-caption italic text-ink-subtle">Ziel nicht gesetzt</div>
    );
  }

  // Scale so the chart shows enough headroom past the bands
  const max = Math.max(currentWeight, targetWeight + tolerancePp) * 1.2;
  const cw = clamp((currentWeight / max) * 100, 0, 100);
  const tMin = clamp(((targetWeight - tolerancePp) / max) * 100, 0, 100);
  const tMax = clamp(((targetWeight + tolerancePp) / max) * 100, 0, 100);
  const t = clamp((targetWeight / max) * 100, 0, 100);

  const delta = currentWeight - targetWeight;
  const absDelta = Math.abs(delta);
  const inBand = absDelta <= tolerancePp;
  const slightlyOver = absDelta <= tolerancePp + 2;
  const color = inBand
    ? 'bg-emerald-500'
    : slightlyOver
      ? 'bg-amber-500'
      : 'bg-red-500';

  return (
    <div className="relative h-3 w-full rounded-full bg-paper">
      {/* tolerance band */}
      <div
        className="absolute top-0 h-3 rounded-full bg-divider/80"
        style={{ left: `${tMin}%`, width: `${tMax - tMin}%` }}
      />
      {/* target marker line */}
      <div
        className="absolute top-[-2px] h-5 w-[2px] bg-ink"
        style={{ left: `${t}%` }}
      />
      {/* current weight dot */}
      <div
        className={`absolute top-1 h-1 w-1.5 rounded-full ${color}`}
        style={{ left: `calc(${cw}% - 3px)` }}
      />
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
