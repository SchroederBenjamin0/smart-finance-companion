import {
  Sparkles,
  PiggyBank,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import type { AccountType } from '@/db/types';

/**
 * Single source of truth for the account/allocation icons used across the
 * income, dashboard, rules and onboarding surfaces. Replaces the former
 * 🎉/🏦/📈 emojis with consistent lucide glyphs.
 */
export const ACCOUNT_ICON: Record<AccountType, LucideIcon> = {
  fun: Sparkles,
  savings: PiggyBank,
  investment: TrendingUp,
};
