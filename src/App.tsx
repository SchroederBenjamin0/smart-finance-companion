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
import { useNavStore } from '@/stores/navigation';
import { useOnboardingStore } from '@/stores/onboarding';
import { runStartupTasks } from '@/modules/watchdog';

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
  const activeTab = useNavStore((s) => s.activeTab);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    void (async () => {
      await Promise.all([
        refreshOnboarding(),
        loadAccounts(),
        loadConfig(),
      ]);
      setBootstrapped(true);
      void requestPersistentStorage();
      // Watchdog runs once a day max — news scan + quarterly insight if due.
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

  if (!onboardingComplete) {
    return (
      <>
        <OnboardingShell />
        <Toaster />
      </>
    );
  }

  if (activeTab === 'settings') {
    return (
      <>
        <Settings />
        <Toaster />
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
    </>
  );
}
