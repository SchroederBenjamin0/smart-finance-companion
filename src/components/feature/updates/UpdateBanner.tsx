import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { RotateCw } from 'lucide-react';

/**
 * Listens for service-worker updates and shows a banner asking the user
 * to reload. The banner is fixed at the top of the screen.
 *
 * Also pings the SW for updates whenever the page becomes visible —
 * iOS standalone PWAs can stay suspended for a long time and miss the
 * background update check, so we re-check when the user opens the app.
 */
export function UpdateBanner() {
  const [needsRefresh, setNeedsRefresh] = useState(false);

  useEffect(() => {
    let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedsRefresh(true);
      },
      onOfflineReady() {
        // first install — silent
      },
    }) as unknown as (reloadPage?: boolean) => Promise<void>;

    function onVisible() {
      if (document.visibilityState === 'visible' && updateSW) {
        void updateSW();
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (!needsRefresh) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[200] flex justify-center px-4"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
    >
      <button
        type="button"
        onClick={() => location.reload()}
        className="pointer-events-auto flex items-center gap-2 rounded-full bg-forest-950 px-4 py-2 text-sm font-semibold text-white shadow-nav animate-pop-in"
      >
        <RotateCw className="h-4 w-4" strokeWidth={2.5} />
        Update verfügbar — neu laden
      </button>
    </div>
  );
}
