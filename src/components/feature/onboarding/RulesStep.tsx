import { Sparkles, PiggyBank, TrendingUp } from 'lucide-react';
import { Slider } from '@/components/ui/Slider';
import type { AllocationRule } from '@/db/types';

interface Props {
  mainRule: AllocationRule;
  djRule: AllocationRule;
  onChange: (patch: {
    mainRule?: AllocationRule;
    djRule?: AllocationRule;
  }) => void;
  onNext: () => void;
  onBack: () => void;
}

export function RulesStep({
  mainRule,
  djRule,
  onChange,
  onNext,
  onBack,
}: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <h2 className="text-2xl font-semibold">Allokations-Regeln</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Wie wird eine Einnahme aufgeteilt? Du kannst das später jederzeit in
          Settings ändern.
        </p>

        <RuleEditor
          title="Hauptjob"
          rule={mainRule}
          onChange={(rule) => onChange({ mainRule: rule })}
        />

        <RuleEditor
          title="DJ-Gig"
          rule={djRule}
          onChange={(rule) => onChange({ djRule: rule })}
        />
      </div>

      <div className="mt-4 flex gap-3">
        <button className="btn-secondary flex-1" onClick={onBack}>
          Zurück
        </button>
        <button className="btn-primary flex-1" onClick={onNext}>
          Weiter
        </button>
      </div>
    </div>
  );
}

interface EditorProps {
  title: string;
  rule: AllocationRule;
  onChange: (rule: AllocationRule) => void;
}

function RuleEditor({ title, rule, onChange }: EditorProps) {
  const setInvestment = (n: number) => {
    const investment = clamp(n, 0, 100 - rule.savingsPercentage);
    onChange({
      ...rule,
      investmentPercentage: investment,
      funPercentage: round1(100 - rule.savingsPercentage - investment),
    });
  };

  const setSavings = (n: number) => {
    const savings = clamp(n, 0, 100 - rule.investmentPercentage);
    onChange({
      ...rule,
      savingsPercentage: savings,
      funPercentage: round1(100 - savings - rule.investmentPercentage),
    });
  };

  return (
    <div className="mt-6 rounded-xl border border-forest-950/10 p-4">
      <h3 className="text-sm font-semibold text-ink">
        {title}
      </h3>

      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-1.5"><TrendingUp className="h-4 w-4" strokeWidth={2.25} /> Investment</span>
          <span className="font-mono">{rule.investmentPercentage} %</span>
        </div>
        <div className="mt-2">
          <Slider
            value={rule.investmentPercentage}
            onChange={setInvestment}
            min={0}
            max={100}
            step={1}
            ariaLabel={`${title} Investment-Anteil`}
          />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-1.5"><PiggyBank className="h-4 w-4" strokeWidth={2.25} /> Sparkonto</span>
          <span className="font-mono">{rule.savingsPercentage} %</span>
        </div>
        <div className="mt-2">
          <Slider
            value={rule.savingsPercentage}
            onChange={setSavings}
            min={0}
            max={100}
            step={1}
            ariaLabel={`${title} Spar-Anteil`}
          />
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-paper px-3 py-2 text-sm">
        <span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4" strokeWidth={2.25} /> Fun-Geld</span>
        <span className="ml-2 font-mono font-semibold">
          {rule.funPercentage} %
        </span>
      </div>
    </div>
  );
}

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));
const round1 = (n: number): number => Math.round(n * 10) / 10;
