import * as RadixSwitch from '@radix-ui/react-switch';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}

export function Switch({ checked, onChange, ariaLabel }: SwitchProps) {
  return (
    <RadixSwitch.Root
      className="relative h-7 w-12 shrink-0 cursor-pointer rounded-full bg-paper outline-none transition data-[state=checked]:bg-forest-950"
      checked={checked}
      onCheckedChange={onChange}
      aria-label={ariaLabel}
    >
      <RadixSwitch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white shadow transition data-[state=checked]:translate-x-[22px]" />
    </RadixSwitch.Root>
  );
}
