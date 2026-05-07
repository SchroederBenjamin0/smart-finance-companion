import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Database,
  FileJson,
  Key,
  Layout,
  PieChart,
  RefreshCw,
  Shield,
  Tag,
  type LucideIcon,
} from 'lucide-react';
import { configRepo } from '@/db/repositories/config';
import { resetDB } from '@/db/client';
import { secretsRepo } from '@/db/repositories/secrets';
import { ALL_CONFIG_KEYS } from '@/db/types';
import { formatEur } from '@/lib/currency';
import { probeAnthropicKey } from '@/services/claude';
import { useAccountsStore } from '@/stores/accounts';
import { useConfigStore } from '@/stores/config';
import { useNavStore } from '@/stores/navigation';
import { useOnboardingStore } from '@/stores/onboarding';
import { useToastStore } from '@/stores/toast';

export function Settings() {
  const config = useConfigStore();
  const setActiveTab = useNavStore((s) => s.setActiveTab);
  const pushToast = useToastStore((s) => s.push);

  const [keyExists, setKeyExists] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [emergencyText, setEmergencyText] = useState(
    String(config.emergencyFundTarget),
  );

  useEffect(() => {
    setEmergencyText(String(config.emergencyFundTarget));
    void (async () => {
      const r = await secretsRepo.exists('anthropic_key');
      if (r.ok) setKeyExists(r.value);
    })();
  }, [config.emergencyFundTarget]);

  async function saveKey() {
    setSaving(true);
    const probe = await probeAnthropicKey(newKey.trim());
    if (!probe.ok) {
      pushToast(`Key ungültig: ${probe.error.message}`, 'error');
      setSaving(false);
      return;
    }
    await secretsRepo.save('anthropic_key', newKey.trim());
    pushToast('Anthropic-Key aktualisiert ✓', 'success');
    setEditingKey(false);
    setNewKey('');
    setKeyExists(true);
    setSaving(false);
  }

  async function saveEmergencyTarget() {
    const n = Number(emergencyText.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) {
      pushToast('Ungültiger Wert', 'error');
      return;
    }
    await config.setEmergencyFundTarget(Math.round(n));
    pushToast('Notgroschen-Ziel aktualisiert ✓', 'success');
  }

  async function resetApp() {
    const ok = window.confirm(
      'Wirklich zurücksetzen? Alle Daten werden gelöscht und das Onboarding startet neu.',
    );
    if (!ok) return;
    await resetDB();
    await Promise.all([
      useAccountsStore.getState().load(),
      useOnboardingStore.getState().refresh(),
      configRepo.remove(ALL_CONFIG_KEYS.onboardingComplete),
    ]);
    location.reload();
  }

  const savings = useAccountsStore((s) =>
    s.accounts.find((a) => a.type === 'savings'),
  );

  const rule = config.rules.main_job;
  const splitLabel = `${rule.investmentPercentage} / ${rule.savingsPercentage} / ${rule.funPercentage}`;

  return (
    <div className="min-h-[100dvh] bg-paper">
      <header
        className="flex items-center gap-3 px-4 pb-3"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-card"
          aria-label="Zurück"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
        </button>
        <h1 className="text-2xl font-semibold">Einstellungen</h1>
      </header>

      <div className="px-4 pt-2">
        <Section title="Allokation">
          <Row
            Icon={PieChart}
            label="Auto-Split-Regeln"
            value={splitLabel}
            hint="Inv / Spar / Fun"
          />
          <Row
            Icon={Shield}
            label="Notgroschen-Ziel"
            value={`${formatEur(savings?.balance ?? 0)} / ${formatEur(config.emergencyFundTarget)}`}
          />
          <RowEditable
            Icon={Layout}
            label="Notgroschen anpassen"
          >
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="100"
                className="input-field flex-1"
                value={emergencyText}
                onChange={(e) => setEmergencyText(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary px-4"
                onClick={() => void saveEmergencyTarget()}
              >
                OK
              </button>
            </div>
          </RowEditable>
        </Section>

        <Section title="Verbindungen">
          <Row
            Icon={Key}
            label="Anthropic API"
            value={keyExists ? 'Verbunden' : 'Fehlt'}
            valueTone={keyExists ? 'good' : 'bad'}
            onClick={() => setEditingKey(true)}
          />
          {editingKey && (
            <div className="px-4 pb-3">
              <input
                type="password"
                autoComplete="off"
                className="input-field"
                placeholder="Neuer Anthropic-Key"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
              />
              <div className="mt-2 flex gap-2">
                <button
                  className="btn-secondary flex-1"
                  onClick={() => {
                    setEditingKey(false);
                    setNewKey('');
                  }}
                >
                  Abbrechen
                </button>
                <button
                  className="btn-primary flex-1"
                  onClick={() => void saveKey()}
                  disabled={saving || newKey.trim().length === 0}
                >
                  {saving ? 'Teste…' : 'Speichern'}
                </button>
              </div>
            </div>
          )}
          <Row
            Icon={Database}
            label="Trade Republic"
            value="Sprint 3"
            valueTone="muted"
          />
          <Row
            Icon={FileJson}
            label="Revolut CSV"
            value="Sprint 2"
            valueTone="muted"
          />
        </Section>

        <Section title="Daten">
          <Row
            Icon={FileJson}
            label="Daten exportieren"
            value="Sprint 2"
            valueTone="muted"
          />
          <Row
            Icon={Tag}
            label="Kategorien verwalten"
            value="Sprint 2"
            valueTone="muted"
          />
          <Row
            Icon={RefreshCw}
            label="App zurücksetzen"
            value=""
            destructive
            onClick={() => void resetApp()}
          />
        </Section>

        <p className="mt-6 pb-2 text-center text-[12px] text-ink-subtle">
          v0.1.0 · Local-only · Keine Telemetrie
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <h2 className="mb-2 ml-1 text-[12px] font-semibold uppercase tracking-wider text-ink-subtle">
        {title}
      </h2>
      <div className="row-divider overflow-hidden rounded-[22px] bg-white shadow-card">
        {children}
      </div>
    </div>
  );
}

interface RowProps {
  Icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  valueTone?: 'good' | 'bad' | 'muted' | 'default';
  onClick?: () => void;
  destructive?: boolean;
}

function Row({
  Icon,
  label,
  value,
  hint,
  valueTone = 'default',
  onClick,
  destructive,
}: RowProps) {
  const valueClasses =
    valueTone === 'good'
      ? 'text-emerald-700'
      : valueTone === 'bad'
        ? 'text-red-600'
        : valueTone === 'muted'
          ? 'text-ink-subtle'
          : 'text-ink';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-paper disabled:cursor-default disabled:active:bg-transparent"
    >
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
          destructive
            ? 'bg-red-50 text-red-600'
            : 'bg-forest-100 text-forest-800'
        }`}
      >
        <Icon className="h-4.5 w-4.5" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-[15px] font-semibold ${
            destructive ? 'text-red-600' : 'text-ink'
          }`}
        >
          {label}
        </div>
        {hint && <div className="text-[12px] text-ink-subtle">{hint}</div>}
      </div>
      {value && (
        <div className={`text-[13px] font-medium tabular-nums ${valueClasses}`}>
          {value}
        </div>
      )}
      {valueTone === 'good' && (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />
      )}
      {onClick && !destructive && valueTone !== 'good' && (
        <ChevronRight className="h-4 w-4 text-ink-subtle" strokeWidth={2.5} />
      )}
    </button>
  );
}

function RowEditable({
  Icon,
  label,
  children,
}: {
  Icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-800">
          <Icon className="h-4.5 w-4.5" strokeWidth={2.25} />
        </div>
        <div className="text-[15px] font-semibold text-ink">{label}</div>
      </div>
      {children}
    </div>
  );
}
