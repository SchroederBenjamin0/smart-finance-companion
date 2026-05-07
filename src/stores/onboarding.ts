import { create } from 'zustand';
import { configRepo } from '@/db/repositories/config';
import { ALL_CONFIG_KEYS } from '@/db/types';

interface OnboardingState {
  complete: boolean | null;
  refresh: () => Promise<void>;
  markComplete: () => Promise<void>;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  complete: null,
  refresh: async () => {
    const r = await configRepo.getJson<boolean>(
      ALL_CONFIG_KEYS.onboardingComplete,
    );
    set({ complete: r.ok && r.value === true });
  },
  markComplete: async () => {
    await configRepo.setJson(ALL_CONFIG_KEYS.onboardingComplete, true);
    set({ complete: true });
  },
}));
