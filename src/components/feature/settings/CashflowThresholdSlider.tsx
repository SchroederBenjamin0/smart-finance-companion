import { useEffect, useState } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { configRepo } from '@/db/repositories/config';
import { ALL_CONFIG_KEYS } from '@/db/types';

const PRESETS = [50, 100, 200, 300, 500];

export function CashflowThresholdSlider() {
  const [value, setValue] = useState(100);

  useEffect(() => {
    void (async () => {
      const r = await configRepo.getRaw(ALL_CONFIG_KEYS.cashflowFunWarnThreshold);
      if (r.ok && r.value) setValue(clamp(Number(r.value), 50, 500));
    })();
  }, []);

  const handleChange = (vals: number[]) => {
    setValue(vals[0] ?? 100);
  };

  // Persist only when the drag/keyboard interaction ends, not on every tick.
  const handleCommit = (vals: number[]) => {
    void configRepo.setRaw(
      ALL_CONFIG_KEYS.cashflowFunWarnThreshold,
      String(vals[0] ?? 100),
    );
  };

  const snapToPreset = (preset: number) => {
    setValue(preset);
    void configRepo.setRaw(ALL_CONFIG_KEYS.cashflowFunWarnThreshold, String(preset));
  };

  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <label className="text-[14px] font-medium text-ink">Cashflow-Warnschwelle</label>
        <span className="text-[14px] tabular-nums text-ink-muted">{value} €</span>
      </div>
      <Slider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        value={[value]}
        onValueChange={handleChange}
        onValueCommit={handleCommit}
        min={50} max={500} step={10}
      >
        <Slider.Track className="relative h-1.5 grow rounded-full bg-divider">
          <Slider.Range className="absolute h-full rounded-full bg-forest-700" />
        </Slider.Track>
        <Slider.Thumb className="block h-5 w-5 rounded-full border-2 border-forest-700 bg-surface shadow" />
      </Slider.Root>
      <div className="mt-2 flex gap-1">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => snapToPreset(p)}
            className={`flex-1 rounded-full px-2 py-1 text-[11px] transition ${
              value === p ? 'bg-forest-700 text-white' : 'bg-paper text-ink-muted'
            }`}
          >
            {p} €
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-subtle">
        Gelbe Warnung erscheint, wenn das Fun-Konto in den nächsten 30 Tagen unter diesen Wert fällt.
      </p>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
