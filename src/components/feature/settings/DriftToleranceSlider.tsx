import { useEffect, useState } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { configRepo } from '@/db/repositories/config';
import { ALL_CONFIG_KEYS } from '@/db/types';

export function DriftToleranceSlider() {
  const [value, setValue] = useState(5);

  useEffect(() => {
    void (async () => {
      const r = await configRepo.getRaw(ALL_CONFIG_KEYS.driftToleranceGlobal);
      if (r.ok && r.value) setValue(Math.max(1, Math.min(10, Number(r.value))));
    })();
  }, []);

  const handleChange = (vals: number[]) => {
    setValue(vals[0] ?? 5);
  };

  // Persist only when the drag/keyboard interaction ends, not on every tick.
  const handleCommit = (vals: number[]) => {
    void configRepo.setRaw(
      ALL_CONFIG_KEYS.driftToleranceGlobal,
      String(vals[0] ?? 5),
    );
  };

  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <label className="text-body font-medium text-ink">Drift-Toleranz</label>
        <span className="text-body tabular-nums text-ink-muted">±{value} pp</span>
      </div>
      <Slider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        value={[value]}
        onValueChange={handleChange}
        onValueCommit={handleCommit}
        min={1} max={10} step={1}
      >
        <Slider.Track className="relative h-1.5 grow rounded-full bg-divider">
          <Slider.Range className="absolute h-full rounded-full bg-forest-700" />
        </Slider.Track>
        <Slider.Thumb className="block h-5 w-5 rounded-full bg-surface border-2 border-forest-700 shadow" />
      </Slider.Root>
    </div>
  );
}
