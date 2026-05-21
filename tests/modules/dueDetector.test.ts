import { describe, it, expect } from 'vitest';
import {
  advanceCycle,
  findDueSubscriptions,
  markBilledOn,
  rollForwardOverdue,
} from '@/modules/subscriptions/dueDetector';
import type { Subscription } from '@/db/types';

function sub(partial: Partial<Subscription> = {}): Subscription {
  return {
    id: 's1',
    name: 'Ableton',
    amount: 9.99,
    currency: 'EUR',
    billingCycle: 'monthly',
    lastBilledDate: null,
    nextBillDate: '2026-05-21T00:00:00.000Z',
    endDate: null,
    category: 'software',
    isActive: 1,
    ...partial,
  };
}

describe('findDueSubscriptions', () => {
  it('treats today as due', () => {
    const today = new Date('2026-05-21T12:00:00Z');
    const s = sub({ nextBillDate: '2026-05-21T00:00:00.000Z' });
    expect(findDueSubscriptions([s], today)).toEqual([s]);
  });

  it('skips ended subs', () => {
    const today = new Date('2026-05-21T12:00:00Z');
    const s = sub({ endDate: '2026-04-30T00:00:00.000Z' });
    expect(findDueSubscriptions([s], today)).toEqual([]);
  });

  it('skips inactive subs', () => {
    const today = new Date('2026-05-21T12:00:00Z');
    const s = sub({ isActive: 0 });
    expect(findDueSubscriptions([s], today)).toEqual([]);
  });
});

describe('advanceCycle', () => {
  it('moves a monthly sub one month forward and records lastBilled', () => {
    const s = sub({ nextBillDate: '2026-05-21T00:00:00.000Z' });
    const next = advanceCycle(s);
    expect(next.lastBilledDate).toBe('2026-05-21T00:00:00.000Z');
    expect(next.nextBillDate.slice(0, 10)).toBe('2026-06-21');
  });

  it('moves a yearly sub twelve months forward', () => {
    const s = sub({
      billingCycle: 'yearly',
      nextBillDate: '2026-05-21T00:00:00.000Z',
    });
    expect(advanceCycle(s).nextBillDate.slice(0, 10)).toBe('2027-05-21');
  });
});

describe('markBilledOn', () => {
  it('uses the given date as the last billed and advances one cycle from it', () => {
    const s = sub({ nextBillDate: '2026-05-25T00:00:00.000Z' });
    const next = markBilledOn(s, '2026-05-21');
    expect(next.lastBilledDate).toBe('2026-05-21');
    expect(next.nextBillDate.slice(0, 10)).toBe('2026-06-21');
  });

  it('strips a timestamp from the input date', () => {
    const s = sub();
    const next = markBilledOn(s, '2026-05-21T13:42:00.000Z');
    expect(next.lastBilledDate).toBe('2026-05-21');
  });
});

describe('rollForwardOverdue', () => {
  it('leaves a sub due today unchanged', () => {
    const s = sub({ nextBillDate: '2026-05-21T00:00:00.000Z' });
    expect(rollForwardOverdue(s, '2026-05-21')).toBe(s);
  });

  it('leaves a future sub unchanged', () => {
    const s = sub({ nextBillDate: '2026-06-15T00:00:00.000Z' });
    expect(rollForwardOverdue(s, '2026-05-21')).toBe(s);
  });

  it('rolls one cycle when the bill date passed by one day', () => {
    const s = sub({ nextBillDate: '2026-05-20T00:00:00.000Z' });
    const next = rollForwardOverdue(s, '2026-05-21');
    expect(next).not.toBe(s);
    expect(next.lastBilledDate).toBe('2026-05-20T00:00:00.000Z');
    expect(next.nextBillDate.slice(0, 10)).toBe('2026-06-20');
  });

  it('catches up across multiple missed cycles', () => {
    const s = sub({ nextBillDate: '2026-01-21T00:00:00.000Z' });
    const next = rollForwardOverdue(s, '2026-05-21');
    expect(next).not.toBe(s);
    // After catch-up the next bill date must no longer be in the past.
    expect(next.nextBillDate.slice(0, 10) >= '2026-05-21').toBe(true);
  });

  it('leaves inactive subs alone', () => {
    const s = sub({
      isActive: 0,
      nextBillDate: '2026-01-21T00:00:00.000Z',
    });
    expect(rollForwardOverdue(s, '2026-05-21')).toBe(s);
  });

  it('leaves ended subs alone', () => {
    const s = sub({
      endDate: '2026-03-01T00:00:00.000Z',
      nextBillDate: '2026-01-21T00:00:00.000Z',
    });
    expect(rollForwardOverdue(s, '2026-05-21')).toBe(s);
  });
});
