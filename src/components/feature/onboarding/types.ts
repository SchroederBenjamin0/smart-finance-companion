import type { AllocationRule, Subscription } from '@/db/types';

export interface OnboardingState {
  anthropicKey: string;
  marketauxKey: string;
  mainRule: AllocationRule;
  djRule: AllocationRule;
  emergencyFundTarget: number;
  subscriptions: SubscriptionDraft[];
}

export interface SubscriptionDraft
  extends Omit<Subscription, 'id' | 'isActive'> {
  enabled: boolean;
}
