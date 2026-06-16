import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  /** Pixels of pull required to trigger a refresh. */
  threshold?: number;
  /** Maximum visible pull distance (visual cap). */
  maxPull?: number;
}

/**
 * Lightweight pull-to-refresh wrapper for mobile PWAs.
 *
 * Listens to touch events at the window level. Activates only when the
 * user starts a downward swipe at scrollTop = 0. Calls onRefresh when
 * the pull crosses the threshold and the user releases.
 */
export function PullToRefresh({
  onRefresh,
  children,
  threshold = 70,
  maxPull = 120,
}: Props) {
  const startY = useRef<number | null>(null);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Live mirrors of the two states so the touch handlers can read them without
  // being in the effect's dep array — otherwise pullY changing on every
  // touchmove would tear down and re-add all three listeners each frame.
  const pullYRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    function setPull(v: number) {
      pullYRef.current = v;
      setPullY(v);
    }
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0) {
        startY.current = null;
        return;
      }
      const t = e.touches[0];
      startY.current = t ? t.clientY : null;
    }
    function onTouchMove(e: TouchEvent) {
      if (refreshingRef.current || startY.current === null) return;
      const t = e.touches[0];
      if (!t) return;
      if (window.scrollY > 0) {
        startY.current = null;
        setPull(0);
        return;
      }
      const dy = t.clientY - startY.current;
      if (dy <= 0) {
        setPull(0);
        return;
      }
      // Resistance curve: 1px finger → ~0.6px pull beyond threshold.
      const resisted = dy < threshold ? dy : threshold + (dy - threshold) * 0.5;
      setPull(Math.min(resisted, maxPull));
      if (dy > 8) e.preventDefault();
    }
    async function onTouchEnd() {
      if (refreshingRef.current) return;
      if (pullYRef.current >= threshold) {
        refreshingRef.current = true;
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
      startY.current = null;
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [onRefresh, threshold, maxPull]);

  const visiblePull = refreshing ? threshold : pullY;
  const progress = Math.min(1, pullY / threshold);

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
        style={{
          height: visiblePull,
          opacity: visiblePull > 0 ? 1 : 0,
          transition: refreshing || pullY === 0 ? 'all 220ms ease' : 'none',
        }}
      >
        <div className="mt-3 grid h-10 w-10 place-items-center rounded-full bg-white text-forest-950 shadow-card">
          <RefreshCw
            className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`}
            style={{
              transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
              transition: refreshing ? 'transform 0.4s linear' : 'none',
            }}
            strokeWidth={2.25}
          />
        </div>
      </div>
      <div
        style={{
          transform: `translateY(${visiblePull}px)`,
          transition: refreshing || pullY === 0 ? 'transform 220ms ease' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
