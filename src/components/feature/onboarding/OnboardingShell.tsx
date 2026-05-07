import { useMemo, useState } from 'react';
import { accountsRepo } from '@/db/repositories/accounts';
import { configRepo } from '@/db/repositories/config';
import { secretsRepo } from '@/db/repositories/secrets';
import { subscriptionsRepo } from '@/db/repositories/subscriptions';
import {
  ALL_CONFIG_KEYS,
  DEFAULT_DJ_RULE,
  DEFAULT_INCOME_THRESHOLDS,
  DEFAULT_MAIN_JOB_RULE,
  type Account,
  type Subscription,
} from '@/db/types';
import { generateId } from '@/lib/id';
import { nowIso } from '@/lib/date';
import { useAccountsStore } from '@/stores/accounts';
import { useConfigStore, DEFAULT_RULES } from '@/stores/config';
import { useOnboardingStore } from '@/stores/onboarding';
import { useToastStore } from '@/stores/toast';
import { ActivationStep } from './ActivationStep';
import { ApiKeysStep } from './ApiKeysStep';
import { EmergencyFundStep } from './EmergencyFundStep';
import { RulesStep } from './RulesStep';
import { SubscriptionsStep } from './SubscriptionsStep';
import { WelcomeStep } from './WelcomeStep';
import { seedSubscriptions } from './seedSubscriptions';
import type { OnboardingState } from './types';

const TOTAL_STEPS = 6;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mql = window.matchMedia?.('(display-mode: standalone)');
  if (mql?.matches) return true;
  const navWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };
  return navWithStandalone.standalone === true;
}

export function OnboardingShell() {
  const [step, setStep] = useState(0);
  const [committing, setCommitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const initialSubs = useMemo(seedSubscriptions, []);

  const [state, setState] = useState<OnboardingState>({
    anthropicKey: '',
    marketauxKey: '',
    mainRule: DEFAULT_MAIN_JOB_RULE,
    djRule: DEFAULT_DJ_RULE,
    emergencyFundTarget: 3300,
    subscriptions: initialSubs,
  });

  const patch = (p: Partial<OnboardingState>) =>
    setState((s) => ({ ...s, ...p }));

  const next = () => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  async function commit() {
    setCommitting(true);
    setErrorMsg(null);
    try {
      // 1. Secrets
      const aRes = await secretsRepo.save(
        'anthropic_key',
        state.anthropicKey.trim(),
      );
      if (!aRes.ok) throw aRes.error;
      if (state.marketauxKey.trim()) {
        const mRes = await secretsRepo.save(
          'marketaux_key',
          state.marketauxKey.trim(),
        );
        if (!mRes.ok) throw mRes.error;
      }

      // 2. Accounts
      const accounts: Account[] = [
        {
          id: generateId(),
          type: 'fun',
          balance: 0,
          goalAmount: null,
          lastUpdated: nowIso(),
        },
        {
          id: generateId(),
          type: 'savings',
          balance: 0,
          goalAmount: state.emergencyFundTarget,
          lastUpdated: nowIso(),
        },
        {
          id: generateId(),
          type: 'investment',
          balance: 0,
          goalAmount: null,
          lastUpdated: nowIso(),
        },
      ];
      const accRes = await accountsRepo.upsertMany(accounts);
      if (!accRes.ok) throw accRes.error;

      // 3. Config (rules, thresholds, target, allocation target)
      const rules = {
        ...DEFAULT_RULES,
        main_job: { ...state.mainRule, savingsCap: state.emergencyFundTarget },
        dj_gig: { ...state.djRule, savingsCap: state.emergencyFundTarget },
      };
      const configWrites = await Promise.all([
        configRepo.setJson(ALL_CONFIG_KEYS.rules, rules),
        configRepo.setJson(
          ALL_CONFIG_KEYS.thresholds,
          DEFAULT_INCOME_THRESHOLDS,
        ),
        configRepo.setJson(
          ALL_CONFIG_KEYS.emergencyFundTarget,
          state.emergencyFundTarget,
        ),
      ]);
      for (const r of configWrites) if (!r.ok) throw r.error;

      // 4. Subscriptions (only enabled ones)
      const subs: Subscription[] = state.subscriptions
        .filter((s) => s.enabled)
        .map((s) => ({
          id: generateId(),
          name: s.name,
          amount: s.amount,
          currency: s.currency,
          billingCycle: s.billingCycle,
          nextBillDate: s.nextBillDate,
          endDate: s.endDate,
          category: s.category,
          isActive: 1,
        }));
      if (subs.length > 0) {
        const subRes = await subscriptionsRepo.upsertMany(subs);
        if (!subRes.ok) throw subRes.error;
      }

      // 5. Onboarding flag
      await useOnboardingStore.getState().markComplete();

      // 6. Refresh in-memory stores
      await Promise.all([
        useAccountsStore.getState().load(),
        useConfigStore.getState().load(),
      ]);

      useToastStore.getState().push('Setup abgeschlossen ✓', 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
      useToastStore.getState().push(`Fehler: ${msg}`, 'error');
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper">
      <header className="px-4 pb-2 pt-[max(env(safe-area-inset-top),16px)]">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-forest-100">
          <div
            className="h-full bg-forest-950 transition-all"
            style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-ink-subtle">
          Schritt {step + 1} von {TOTAL_STEPS}
        </p>
      </header>

      <main className="flex flex-1 flex-col px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-2">
        {step === 0 && <WelcomeStep onNext={next} />}
        {step === 1 && (
          <ApiKeysStep
            anthropicKey={state.anthropicKey}
            marketauxKey={state.marketauxKey}
            onChange={patch}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 2 && (
          <RulesStep
            mainRule={state.mainRule}
            djRule={state.djRule}
            onChange={patch}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 3 && (
          <EmergencyFundStep
            emergencyFundTarget={state.emergencyFundTarget}
            onChange={(n) => patch({ emergencyFundTarget: n })}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 4 && (
          <SubscriptionsStep
            subscriptions={state.subscriptions}
            onChange={(subs) => patch({ subscriptions: subs })}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 5 && (
          <ActivationStep
            isInstalled={isStandalone()}
            onBack={back}
            onFinish={() => void commit()}
          />
        )}

        {errorMsg && (
          <div
            role="alert"
            className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {errorMsg}
          </div>
        )}
        {committing && (
          <div className="mt-2 text-center text-sm text-ink-subtle">
            Speichere…
          </div>
        )}
      </main>
    </div>
  );
}
