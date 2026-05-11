import { create } from 'zustand';

export type StatsSubTab = 'overview' | 'spending' | 'cashflow';

interface StatsNavState {
  /** If non-null, Stats view will jump to this sub-tab on mount and clear the value. */
  pendingSubTab: StatsSubTab | null;
  setPendingSubTab: (t: StatsSubTab) => void;
  clearPendingSubTab: () => void;
}

export const useStatsNavStore = create<StatsNavState>((set) => ({
  pendingSubTab: null,
  setPendingSubTab: (t) => set({ pendingSubTab: t }),
  clearPendingSubTab: () => set({ pendingSubTab: null }),
}));
