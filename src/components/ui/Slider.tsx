import * as RadixSlider from '@radix-ui/react-slider';

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  ariaLabel?: string;
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  ariaLabel,
}: SliderProps) {
  return (
    <RadixSlider.Root
      className="relative flex h-10 w-full touch-none select-none items-center"
      value={[value]}
      onValueChange={(v) => onChange(v[0] ?? min)}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
    >
      <RadixSlider.Track className="relative h-2 w-full grow rounded-full bg-forest-100">
        <RadixSlider.Range className="absolute h-full rounded-full bg-forest-950" />
      </RadixSlider.Track>
      <RadixSlider.Thumb
        className="block h-7 w-7 rounded-full border-2 border-forest-950 bg-white shadow-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-700"
        aria-label={ariaLabel}
      />
    </RadixSlider.Root>
  );
}
