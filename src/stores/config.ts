import { create } from 'zustand';
import { configRepo } from '@/db/repositories/config';
import {
  ALL_CONFIG_KEYS,
  DEFAULT_DJ_RULE,
  DEFAULT_INCOME_THRESHOLDS,
  DEFAULT_MAIN_JOB_RULE,
  DEFAULT_OTHER_RULE,
  type AllocationRule,
  type IncomeSource,
  type IncomeThresholds,
} from '@/db/types';

export interface AllocationRulesByJob {
  main_job: AllocationRule;
  dj_gig: AllocationRule;
  other: AllocationRule;
}

export const DEFAULT_RULES: AllocationRulesByJob = {
  main_job: DEFAULT_MAIN_JOB_RULE,
  dj_gig: DEFAULT_DJ_RULE,
  other: DEFAULT_OTHER_RULE,
};

interface ConfigState {
  rules: AllocationRulesByJob;
  thresholds: IncomeThresholds;
  emergencyFundTarget: number;
  loaded: boolean;
  load: () => Promise<void>;
  setRules: (rules: AllocationRulesByJob) => Promise<void>;
  setThresholds: (t: IncomeThresholds) => Promise<void>;
  setEmergencyFundTarget: (n: number) => Promise<void>;
  ruleFor: (source: IncomeSource) => AllocationRule;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  rules: DEFAULT_RULES,
  thresholds: DEFAULT_INCOME_THRESHOLDS,
  emergencyFundTarget: 3300,
  loaded: false,
  load: async () => {
    const [rulesR, threshR, fundR] = await Promise.all([
      configRepo.getJson<AllocationRulesByJob>(ALL_CONFIG_KEYS.rules),
      configRepo.getJson<IncomeThresholds>(ALL_CONFIG_KEYS.thresholds),
      configRepo.getJson<number>(ALL_CONFIG_KEYS.emergencyFundTarget),
    ]);
    set({
      rules: rulesR.ok && rulesR.value ? rulesR.value : DEFAULT_RULES,
      thresholds:
        threshR.ok && threshR.value
          ? threshR.value
          : DEFAULT_INCOME_THRESHOLDS,
      emergencyFundTarget:
        fundR.ok && typeof fundR.value === 'number' ? fundR.value : 3300,
      loaded: true,
    });
  },
  setRules: async (rules) => {
    set({ rules });
    await configRepo.setJson(ALL_CONFIG_KEYS.rules, rules);
  },
  setThresholds: async (thresholds) => {
    set({ thresholds });
    await configRepo.setJson(ALL_CONFIG_KEYS.thresholds, thresholds);
  },
  setEmergencyFundTarget: async (n) => {
    set({ emergencyFundTarget: n });
    await configRepo.setJson(ALL_CONFIG_KEYS.emergencyFundTarget, n);
  },
  ruleFor: (source) => get().rules[source],
}));
