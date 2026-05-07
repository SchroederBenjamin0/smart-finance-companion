import { create } from 'zustand';

export type TabId = 'home' | 'add' | 'subs' | 'inv' | 'stats' | 'settings';

interface NavState {
  activeTab: TabId;
  setActiveTab: (t: TabId) => void;
}

export const useNavStore = create<NavState>((set) => ({
  activeTab: 'home',
  setActiveTab: (t) => set({ activeTab: t }),
}));
