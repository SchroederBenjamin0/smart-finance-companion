import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Database,
  FileJson,
  Key,
  Layout,
  Lock as LockIcon,
  PieChart,
  PiggyBank,
  RefreshCw,
  Repeat,
  Shield,
  Tag,
  Trash2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { BackupSection } from '@/components/feature/settings/BackupSection';
import { CashflowThresholdSlider } from '@/components/feature/settings/CashflowThresholdSlider';
import { DriftToleranceSlider } from '@/components/feature/settings/DriftToleranceSlider';
import { LoansSection } from '@/components/feature/settings/LoansSection';
import { PinSettingsSheet } from '@/components/feature/settings/PinSettingsSheet';
import { RulesEditorSheet } from '@/components/feature/settings/RulesEditorSheet';
import { accountsRepo } from '@/db/repositories/accounts';
import { configRepo } from '@/db/repositories/config';
import { resetDB } from '@/db/client';
import { dataMaintenanceRepo } from '@/db/repositories/dataMaintenance';
import { secretsRepo } from '@/db/repositories/secrets';
import { ALL_CONFIG_KEYS } from '@/db/types';
import { formatEur, parseEurInput } from '@/lib/currency';
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
  const [editingRules, setEditingRules] = useState(false);
  const [editingPin, setEditingPin] = useState(false);
  const [pinIsSet, setPinIsSet] = useState(false);
  const [emergencyText, setEmergencyText] = useState(
    String(config.emergencyFundTarget),
  );

  // Keep the emergency-fund input in sync with the store value.
  useEffect(() => {
    setEmergencyText(String(config.emergencyFundTarget));
  }, [config.emergencyFundTarget]);

  // Probe API-key + PIN existence once on mount — independent of emergency-fund
  // edits, so saving the target doesn't re-hit IndexedDB for unrelated state.
  useEffect(() => {
    void (async () => {
      const r = await secretsRepo.exists('anthropic_key');
      if (r.ok) setKeyExists(r.value);
      const p = await configRepo.getJson<string>(ALL_CONFIG_KEYS.appPinHash);
      setPinIsSet(p.ok && typeof p.value === 'string' && p.value.length > 0);
    })();
  }, []);

  const reloadPinState = async () => {
    const p = await configRepo.getJson<string>(ALL_CONFIG_KEYS.appPinHash);
    setPinIsSet(p.ok && typeof p.value === 'string' && p.value.length > 0);
  };

  async function saveKey() {
    setSaving(true);
    const probe = await probeAnthropicKey(newKey.trim());
    if (!probe.ok) {
      pushToast(`Key ungültig: ${probe.error.message}`, 'error');
      setSaving(false);
      return;
    }
    await secretsRepo.save('anthropic_key', newKey.trim());
    pushToast('Anthropic-Key aktualisiert', 'success');
    setEditingKey(false);
    setNewKey('');
    setKeyExists(true);
    setSaving(false);
  }

  async function saveEmergencyTarget() {
    const n = parseEurInput(emergencyText);
    if (n === null || n < 0) {
      pushToast('Ungültiger Wert', 'error');
      return;
    }
    await config.setEmergencyFundTarget(Math.round(n));
    pushToast('Notgroschen-Ziel aktualisiert', 'success');
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
  const fun = useAccountsStore((s) =>
    s.accounts.find((a) => a.type === 'fun'),
  );
  const reloadAccounts = useAccountsStore((s) => s.load);

  const rule = config.rules.main_job;
  const splitLabel = `${rule.investmentPercentage} / ${rule.savingsPercentage} / ${rule.funPercentage}`;

  async function setBalance(type: 'fun' | 'savings', raw: string) {
    const n = parseEurInput(raw);
    if (n === null || n < 0) {
      pushToast('Ungültiger Saldo', 'error');
      return;
    }
    const r = await accountsRepo.setBalance(type, n);
    if (!r.ok) {
      pushToast(`Fehler: ${r.error.message}`, 'error');
      return;
    }
    await reloadAccounts();
    pushToast('Saldo aktualisiert', 'success');
  }

  async function handleClearSubscriptions() {
    if (
      !window.confirm(
        'Alle Abos löschen? Deine Subscription-Liste wird entfernt. Andere Daten bleiben erhalten.',
      )
    )
      return;
    const r = await dataMaintenanceRepo.clearSubscriptions();
    if (!r.ok) {
      pushToast(`Fehler: ${r.error.message}`, 'error');
      return;
    }
    pushToast('Abos gelöscht', 'success');
  }

  async function handleClearRevolut() {
    if (
      !window.confirm(
        'Alle Transaktionen und CSV-Importe löschen? Die Konten-Salden bleiben unverändert (anpassbar oben unter „Konten-Salden").',
      )
    )
      return;
    const r = await dataMaintenanceRepo.clearRevolutData();
    if (!r.ok) {
      pushToast(`Fehler: ${r.error.message}`, 'error');
      return;
    }
    pushToast('Revolut-Daten gelöscht', 'success');
  }

  async function handleClearPositions() {
    if (
      !window.confirm(
        'Alle Trade-Republic-Positionen löschen? Kurs- und News-Cache werden ebenfalls geleert.',
      )
    )
      return;
    const r = await dataMaintenanceRepo.clearInvestmentPositions();
    if (!r.ok) {
      pushToast(`Fehler: ${r.error.message}`, 'error');
      return;
    }
    pushToast('Positionen gelöscht', 'success');
  }

  async function handleClearAll() {
    if (
      !window.confirm(
        'ALLE Finanzdaten löschen? Transaktionen, Abos, Positionen, Einnahmen und Salden werden entfernt. API-Key, PIN und Einstellungen bleiben erhalten.',
      )
    )
      return;
    const r = await dataMaintenanceRepo.clearAllFinancialData();
    if (!r.ok) {
      pushToast(`Fehler: ${r.error.message}`, 'error');
      return;
    }
    await reloadAccounts();
    pushToast('Alle Finanzdaten gelöscht', 'success');
  }

  return (
    <div className="min-h-[100dvh] bg-paper">
      <header
        className="flex items-center gap-3 px-4 pb-3"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className="grid h-10 w-10 place-items-center rounded-full bg-surface shadow-card"
          aria-label="Zurück"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
        </button>
        <h1 className="text-2xl font-semibold">Einstellungen</h1>
      </header>

      <div className="px-4 pt-2">
        <Section title="Konten-Salden">
          <p className="px-4 pt-3 text-meta leading-snug text-ink-subtle">
            Die Salden werden beim Revolut-CSV-Import automatisch auf den
            jüngsten Wert aus der Datei gesetzt. Hier kannst du sie zwischen
            den Imports manuell anpassen, wenn der angezeigte Wert von der
            Revolut-App abweicht.
          </p>
          <BalanceRow
            Icon={Wallet}
            label="Fun-Geld"
            currentBalance={fun?.balance ?? 0}
            onSave={(v) => void setBalance('fun', v)}
          />
          <BalanceRow
            Icon={PiggyBank}
            label="Sparkonto"
            currentBalance={savings?.balance ?? 0}
            onSave={(v) => void setBalance('savings', v)}
          />
        </Section>

        <Section title="Allokation">
          <Row
            Icon={PieChart}
            label="Auto-Split-Regeln"
            value={splitLabel}
            hint="Inv / Spar / Fun"
            onClick={() => setEditingRules(true)}
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
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="input-field flex-1 tabular-nums"
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

        <Section title="Investments">
          <DriftToleranceSlider />
          <CashflowThresholdSlider />
        </Section>

        <LoansSection />

        <BackupSection />

        <Section title="Sicherheit">
          <Row
            Icon={LockIcon}
            label="App-PIN"
            value={pinIsSet ? 'Aktiv' : 'Aus'}
            valueTone={pinIsSet ? 'good' : 'muted'}
            onClick={() => setEditingPin(true)}
          />
        </Section>

        <Section title="Daten löschen">
          <Row
            Icon={Repeat}
            label="Nur Abos löschen"
            value=""
            destructive
            onClick={() => void handleClearSubscriptions()}
          />
          <Row
            Icon={FileJson}
            label="Nur Revolut-CSV löschen"
            value=""
            destructive
            onClick={() => void handleClearRevolut()}
          />
          <Row
            Icon={Database}
            label="Nur Trade-Republic-Positionen löschen"
            value=""
            destructive
            onClick={() => void handleClearPositions()}
          />
          <Row
            Icon={Trash2}
            label="Alle Finanzdaten löschen"
            value=""
            destructive
            onClick={() => void handleClearAll()}
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

        <p className="mt-6 pb-2 text-center text-meta text-ink-subtle">
          v0.1.0 · Local-only · Keine Telemetrie
        </p>
      </div>

      <RulesEditorSheet
        open={editingRules}
        onOpenChange={setEditingRules}
      />
      <PinSettingsSheet
        open={editingPin}
        onOpenChange={setEditingPin}
        pinIsSet={pinIsSet}
        onChanged={() => void reloadPinState()}
      />
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
      <h2 className="mb-2 ml-1 text-meta font-semibold uppercase tracking-wider text-ink-subtle">
        {title}
      </h2>
      <div className="row-divider overflow-hidden rounded-[22px] bg-surface shadow-card">
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
      ? 'text-emerald-700 dark:text-emerald-400'
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
            : 'bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200'
        }`}
      >
        <Icon className="h-4.5 w-4.5" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-body font-semibold ${
            destructive ? 'text-red-600' : 'text-ink'
          }`}
        >
          {label}
        </div>
        {hint && <div className="text-meta text-ink-subtle">{hint}</div>}
      </div>
      {value && (
        <div className={`text-label font-medium tabular-nums ${valueClasses}`}>
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
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200">
          <Icon className="h-4.5 w-4.5" strokeWidth={2.25} />
        </div>
        <div className="text-body font-semibold text-ink">{label}</div>
      </div>
      {children}
    </div>
  );
}

function BalanceRow({
  Icon,
  label,
  currentBalance,
  onSave,
}: {
  Icon: LucideIcon;
  label: string;
  currentBalance: number;
  onSave: (raw: string) => void;
}) {
  const [text, setText] = useState(currentBalance.toFixed(2));
  useEffect(() => {
    setText(currentBalance.toFixed(2));
  }, [currentBalance]);
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-200">
          <Icon className="h-4.5 w-4.5" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1 text-body font-semibold text-ink">
          {label}
        </div>
        <div className="text-label font-medium tabular-nums text-ink-subtle">
          aktuell {formatEur(currentBalance)}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="input-field flex-1 tabular-nums"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={`Saldo ${label}`}
        />
        <button
          type="button"
          className="btn-primary px-4"
          onClick={() => onSave(text)}
        >
          Setzen
        </button>
      </div>
    </div>
  );
}
