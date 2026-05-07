import { addMonths } from '@/lib/date';
import type { SubscriptionDraft } from './types';

export function seedSubscriptions(): SubscriptionDraft[] {
  const today = new Date().toISOString();
  const nextMonth = addMonths(today, 1);
  const inFourMonths = addMonths(today, 4);
  const make = (
    overrides: Partial<SubscriptionDraft> & {
      name: string;
      amount: number;
      category: string;
    },
  ): SubscriptionDraft => ({
    currency: 'EUR',
    billingCycle: 'monthly',
    lastBilledDate: today,
    nextBillDate: nextMonth,
    endDate: null,
    enabled: true,
    ...overrides,
  });

  return [
    make({ name: 'Lexware', amount: 12.9, category: 'Buchhaltung' }),
    make({ name: 'Splice', amount: 13.23, category: 'Music-Tools' }),
    make({
      name: 'Splice Serum (Rent-to-Own)',
      amount: 8.53,
      category: 'Music-Tools',
      endDate: inFourMonths,
    }),
    make({ name: 'ChatGPT Plus', amount: 9.83, category: 'AI-Tools' }),
    make({ name: 'SoundCloud', amount: 4.99, category: 'Music-Hosting' }),
    make({ name: 'Snapchat+', amount: 3.99, category: 'Social' }),
  ];
}
