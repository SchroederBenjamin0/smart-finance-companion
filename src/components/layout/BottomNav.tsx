import { Home, Plus, CreditCard, TrendingUp, BarChart3 } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { useNavStore, type TabId } from '@/stores/navigation';
import { haptic } from '@/lib/haptic';

interface TabDef {
  id: TabId;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const TABS: TabDef[] = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'add', label: 'Add', Icon: Plus },
  { id: 'subs', label: 'Subs', Icon: CreditCard },
  { id: 'inv', label: 'Invest', Icon: TrendingUp },
  { id: 'stats', label: 'Stats', Icon: BarChart3 },
];

export function BottomNav() {
  const activeTab = useNavStore((s) => s.activeTab);
  const setActiveTab = useNavStore((s) => s.setActiveTab);

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 before:pointer-events-none before:absolute before:inset-x-0 before:-top-8 before:h-8 before:bg-gradient-to-t before:from-paper before:to-transparent"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      aria-label="Hauptnavigation"
    >
      <ul className="pointer-events-auto flex h-[54px] items-center gap-1 rounded-[28px] bg-forest-950 p-1.5 shadow-nav">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <li key={tab.id} className="contents">
              <button
                type="button"
                onClick={() => {
                  if (!isActive) haptic('light');
                  setActiveTab(tab.id);
                }}
                aria-current={isActive ? 'page' : undefined}
                aria-label={tab.label}
                className={`flex h-[42px] items-center gap-1.5 rounded-[22px] px-3 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-white text-forest-950'
                    : 'text-white/85 hover:text-white'
                }`}
              >
                <tab.Icon className="h-5 w-5" strokeWidth={2.25} />
                {isActive && <span>{tab.label}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
