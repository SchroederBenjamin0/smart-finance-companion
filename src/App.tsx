import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { OnboardingShell } from '@/components/feature/onboarding/OnboardingShell';
import { Toaster } from '@/components/ui/Toaster';
import { Dashboard } from '@/views/Dashboard';
import { Income } from '@/views/Income';
import { Subscriptions } from '@/views/Subscriptions';
import { Investments } from '@/views/Investments';
import { Stats } from '@/views/Stats';
import { Settings } from '@/views/Settings';
import { useAccountsStore } from '@/stores/accounts';
import { useConfigStore } from '@/stores/config';
import { useThemeStore } from '@/stores/theme';
import { useNavStore } from '@/stores/navigation';
import { useOnboardingStore } from '@/stores/onboarding';
import { useSharePrefillStore } from '@/stores/sharePrefill';
import { runStartupTasks } from '@/modules/watchdog';
import { configRepo } from '@/db/repositories/config';
import { ALL_CONFIG_KEYS } from '@/db/types';
import { PinGate } from '@/components/feature/lock/PinGate';
import { UpdateBanner } from '@/components/feature/updates/UpdateBanner';
import { parseEurInput } from '@/lib/currency';

/**
 * Parse text shared from another iOS app via the Web Share Target API.
 * Extracts the first numeric value (with optional €, comma decimal, negative sign)
 * and returns it together with the full original text as a note.
 */
export function parseSharedText(text: string): { amount: number | null; note: string } {
  // Grab the first number-ish token (digits + grouping separators, optional
  // sign) and parse it with the shared currency parser, so grouped amounts
  // like "1.234,56 €" round-trip instead of truncating to 1.23.
  const m = text.match(/-?[\d.,]+/);
  return {
    amount: m ? parseEurInput(m[0]) : null,
    note: text,
  };
}

async function requestPersistentStorage(): Promise<void> {
  if (typeof navigator === 'undefined') return;
  if (!navigator.storage?.persist) return;
  try {
    const already = await navigator.storage.persisted();
    if (!already) await navigator.storage.persist();
  } catch {
    // ignore — best effort
  }
}

export function App() {
  const onboardingComplete = useOnboardingStore((s) => s.complete);
  const refreshOnboarding = useOnboardingStore((s) => s.refresh);
  const loadAccounts = useAccountsStore((s) => s.load);
  const loadConfig = useConfigStore((s) => s.load);
  const loadTheme = useThemeStore((s) => s.load);
  const syncSystemTheme = useThemeStore((s) => s.syncSystem);
  const activeTab = useNavStore((s) => s.activeTab);
  const setActiveTab = useNavStore((s) => s.setActiveTab);
  const setPrefill = useSharePrefillStore((s) => s.setPrefill);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [pinHash, setPinHash] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  // Detect share_target launch: /smart-finance-companion/share?text=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedText = params.get('text') ?? params.get('title') ?? params.get('url');
    if (sharedText) {
      const parsed = parseSharedText(sharedText);
      setPrefill(parsed);
      setActiveTab('add');
      // Clean the URL so refreshing doesn't re-trigger the prefill
      const cleanUrl = window.location.pathname;
      window.history.replaceState(null, '', cleanUrl);
    }
  }, [setPrefill, setActiveTab]);

  // Apply the persisted theme (palette / mode / accent / font) as early as
  // possible, then keep it in sync when the OS light/dark preference flips
  // while the user is on "system" mode.
  useEffect(() => {
    void loadTheme();
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => syncSystemTheme();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [loadTheme, syncSystemTheme]);

  useEffect(() => {
    void (async () => {
      await Promise.all([
        refreshOnboarding(),
        loadAccounts(),
        loadConfig(),
      ]);
      const pin = await configRepo.getJson<string>(ALL_CONFIG_KEYS.appPinHash);
      const hash = pin.ok && typeof pin.value === 'string' ? pin.value : null;
      setPinHash(hash);
      if (!hash) setUnlocked(true);
      setBootstrapped(true);
      void requestPersistentStorage();
      void runStartupTasks().catch(() => undefined);
    })();
  }, [refreshOnboarding, loadAccounts, loadConfig]);

  if (!bootstrapped || onboardingComplete === null) {
    return (
      <div
        className="flex min-h-[100dvh] items-center justify-center"
        aria-label="Lädt"
      />
    );
  }

  if (pinHash && !unlocked) {
    return (
      <>
        <PinGate expectedHash={pinHash} onUnlock={() => setUnlocked(true)} />
        <UpdateBanner />
      </>
    );
  }

  if (!onboardingComplete) {
    return (
      <>
        <OnboardingShell />
        <Toaster />
        <UpdateBanner />
      </>
    );
  }

  if (activeTab === 'settings') {
    return (
      <>
        <Settings />
        <Toaster />
        <UpdateBanner />
      </>
    );
  }

  return (
    <>
      <AppShell>
        {activeTab === 'home' && <Dashboard />}
        {activeTab === 'add' && <Income />}
        {activeTab === 'subs' && <Subscriptions />}
        {activeTab === 'inv' && <Investments />}
        {activeTab === 'stats' && <Stats />}
      </AppShell>
      <Toaster />
      <UpdateBanner />
    </>
  );
}
