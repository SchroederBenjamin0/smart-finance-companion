import { useEffect, useState } from 'react';
import { Sparkles, PiggyBank, TrendingUp } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Slider } from '@/components/ui/Slider';
import type { AllocationRule, IncomeSource } from '@/db/types';
import { useConfigStore, type AllocationRulesByJob } from '@/stores/config';
import { useToastStore } from '@/stores/toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SOURCES: { id: IncomeSource; label: string }[] = [
  { id: 'main_job', label: 'Hauptjob' },
  { id: 'dj_gig', label: 'DJ-Gig' },
  { id: 'other', label: 'Sonstiges' },
];

export function RulesEditorSheet({ open, onOpenChange }: Props) {
  const rules = useConfigStore((s) => s.rules);
  const setRules = useConfigStore((s) => s.setRules);
  const pushToast = useToastStore((s) => s.push);

  const [draft, setDraft] = useState<AllocationRulesByJob>(rules);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(rules);
  }, [open, rules]);

  function update(source: IncomeSource, rule: AllocationRule) {
    setDraft((d) => ({ ...d, [source]: rule }));
  }

  async function save() {
    setSaving(true);
    await setRules(draft);
    pushToast('Regeln aktualisiert', 'success');
    setSaving(false);
    onOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Auto-Split-Regeln"
      footer={
        <button
          type="button"
          className="btn-primary w-full"
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? 'Speichere…' : 'Änderungen speichern'}
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-meta text-ink-subtle">
          Pro Einnahme-Quelle: wie viel ins Investment-Konto, ins Sparkonto,
          ins Fun-Geld? Fun-Anteil errechnet sich automatisch.
        </p>
        {SOURCES.map((s) => (
          <RuleEditor
            key={s.id}
            title={s.label}
            rule={draft[s.id]}
            onChange={(r) => update(s.id, r)}
          />
        ))}
      </div>
    </Sheet>
  );
}

function RuleEditor({
  title,
  rule,
  onChange,
}: {
  title: string;
  rule: AllocationRule;
  onChange: (rule: AllocationRule) => void;
}) {
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
    <div className="rounded-2xl border border-forest-950/10 bg-surface p-4">
      <h3 className="text-body font-semibold text-ink">{title}</h3>

      <div className="mt-3">
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

      <div className="mt-3">
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

      <div className="mt-3 rounded-lg bg-paper px-3 py-2 text-sm">
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
