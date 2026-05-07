import { addMonths } from '@/lib/date';
import type { SubscriptionDraft } from './types';

export function seedSubscriptions(): SubscriptionDraft[] {
  const nextMonth = addMonths(new Date().toISOString(), 1);
  const inFourMonths = addMonths(new Date().toISOString(), 4);
  return [
    {
      name: 'Lexware',
      amount: 12.9,
      currency: 'EUR',
      billingCycle: 'monthly',
      nextBillDate: nextMonth,
      endDate: null,
      category: 'Buchhaltung',
      enabled: true,
    },
    {
      name: 'Splice',
      amount: 13.23,
      currency: 'EUR',
      billingCycle: 'monthly',
      nextBillDate: nextMonth,
      endDate: null,
      category: 'Music-Tools',
      enabled: true,
    },
    {
      name: 'Splice Serum (Rent-to-Own)',
      amount: 8.53,
      currency: 'EUR',
      billingCycle: 'monthly',
      nextBillDate: nextMonth,
      endDate: inFourMonths,
      category: 'Music-Tools',
      enabled: true,
    },
    {
      name: 'ChatGPT Plus',
      amount: 9.83,
      currency: 'EUR',
      billingCycle: 'monthly',
      nextBillDate: nextMonth,
      endDate: null,
      category: 'AI-Tools',
      enabled: true,
    },
    {
      name: 'SoundCloud',
      amount: 4.99,
      currency: 'EUR',
      billingCycle: 'monthly',
      nextBillDate: nextMonth,
      endDate: null,
      category: 'Music-Hosting',
      enabled: true,
    },
    {
      name: 'Snapchat+',
      amount: 3.99,
      currency: 'EUR',
      billingCycle: 'monthly',
      nextBillDate: nextMonth,
      endDate: null,
      category: 'Social',
      enabled: true,
    },
  ];
}
