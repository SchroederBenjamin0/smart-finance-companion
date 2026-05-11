import { create } from 'zustand';

export interface SharePrefill {
  amount: number | null;
  note: string;
}

interface SharePrefillState {
  prefill: SharePrefill | null;
  /** Set once when the app opens via a share_target URL. */
  setPrefill: (p: SharePrefill) => void;
  /** Call after the Income view has consumed the prefill. */
  clearPrefill: () => void;
}

export const useSharePrefillStore = create<SharePrefillState>((set) => ({
  prefill: null,
  setPrefill: (p) => set({ prefill: p }),
  clearPrefill: () => set({ prefill: null }),
}));
