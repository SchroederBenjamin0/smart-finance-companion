import { create } from 'zustand';
import { accountsRepo } from '@/db/repositories/accounts';
import type { Account, AccountType } from '@/db/types';

interface AccountsState {
  accounts: Account[];
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  byType: (t: AccountType) => Account | undefined;
}

export const useAccountsStore = create<AccountsState>((set, get) => ({
  accounts: [],
  loaded: false,
  error: null,
  load: async () => {
    const r = await accountsRepo.findAll();
    if (r.ok) {
      set({ accounts: r.value, loaded: true, error: null });
    } else {
      set({ error: r.error.message, loaded: true });
    }
  },
  byType: (t) => get().accounts.find((a) => a.type === t),
}));
