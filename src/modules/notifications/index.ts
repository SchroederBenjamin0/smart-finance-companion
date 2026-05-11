import { configRepo } from '@/db/repositories/config';
import { incomeRepo } from '@/db/repositories/income';
import { notificationLogRepo } from '@/db/repositories/notificationLog';
import { positionsRepo } from '@/db/repositories/positions';
import { subscriptionsRepo } from '@/db/repositories/subscriptions';
import { ALL_CONFIG_KEYS, type NotificationTrigger } from '@/db/types';
import { generateId } from '@/lib/id';
import { nowIso } from '@/lib/date';
import { debug, debugWarn } from '@/lib/debug';
import {
  shouldFireAllocation,
  shouldFireSubscription,
  shouldFireDrift,
  buildAllocationDedupeKey,
  buildSubscriptionDedupeKey,
  buildDriftDedupeKey,
} from './triggers';

export interface NotificationTriggersConfig {
  allocation: boolean;
  subscription: boolean;
  drift: boolean;
  anomaly: boolean;
  cashflow: boolean;
}

// DEFAULT_TRIGGERS keeps anomaly + cashflow as `true` on purpose: the Settings UI
// (Task 11) reads these defaults to populate sub-toggles, and the corresponding
// fire paths land in Batch 3. The dispatcher below ignores them for now.
const DEFAULT_TRIGGERS: NotificationTriggersConfig = {
  allocation: true,
  subscription: true,
  drift: true,
  anomaly: true,
  cashflow: true,
};

interface DispatchedNotification {
  title: string;
  body: string;
  dedupeKey: string;
  type: NotificationTrigger;
  route?: string;
}

/**
 * Called by the watchdog on app-start. Checks all enabled triggers,
 * fires notifications when conditions met, and writes each fired notification
 * to notificationLog (dedupe).
 *
 * Anomaly trigger is wired in CSV-import flow (Batch 3), Cashflow trigger
 * needs the forecast module (Batch 3). Only allocation/subscription/drift
 * are dispatched here.
 */
export async function dispatchPendingNotifications(): Promise<void> {
  const enabledR = await configRepo.getRaw(ALL_CONFIG_KEYS.notificationsEnabled);
  if (!enabledR.ok || enabledR.value !== 'true') return;

  const triggers = await loadTriggers();
  const now = new Date();
  const pending: DispatchedNotification[] = [];

  if (triggers.allocation) {
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const incomeR = await incomeRepo.findSince(startOfMonth);
    if (incomeR.ok) {
      const r = shouldFireAllocation({ now, incomeEntriesThisMonth: incomeR.value });
      if (r.shouldFire) {
        const key = buildAllocationDedupeKey(now);
        const exists = await notificationLogRepo.findByDedupeKey(key);
        if (exists.ok && exists.value === null) {
          pending.push({
            type: 'allocation',
            title: 'Allokation fällig',
            body: r.overdueDays > 0
              ? `Allokation für diesen Monat seit ${r.overdueDays} Tagen offen`
              : `Allokation für ${monthName(now)} starten`,
            dedupeKey: key,
            route: '/income',
          });
        }
      }
    }
  }

  if (triggers.subscription) {
    const subsR = await subscriptionsRepo.findActive();
    if (subsR.ok) {
      for (const sub of subsR.value) {
        const r = shouldFireSubscription(sub, now);
        if (!r.shouldFire) continue;
        const key = buildSubscriptionDedupeKey(sub.id, sub.nextBillDate);
        const exists = await notificationLogRepo.findByDedupeKey(key);
        if (exists.ok && exists.value === null) {
          pending.push({
            type: 'subscription',
            title: 'Abo-Abbuchung steht an',
            body: r.daysUntil === 0
              ? `${sub.name} bucht heute ${sub.amount.toFixed(2)} ${sub.currency} ab`
              : `${sub.name} bucht in ${r.daysUntil} Tagen ${sub.amount.toFixed(2)} ${sub.currency} ab`,
            dedupeKey: key,
            route: '/subscriptions',
          });
        }
      }
    }
  }

  if (triggers.drift) {
    const positionsR = await positionsRepo.findAll();
    const toleranceR = await configRepo.getRaw(ALL_CONFIG_KEYS.driftToleranceGlobal);
    const tolerance = toleranceR.ok && toleranceR.value
      ? Math.max(1, Math.min(10, Number(toleranceR.value)))
      : 5;

    if (positionsR.ok && positionsR.value.length > 0) {
      const totalValue = positionsR.value.reduce((s, p) => s + p.currentValue, 0);
      if (totalValue > 0) {
        for (const pos of positionsR.value) {
          const currentWeight = (pos.currentValue / totalValue) * 100;
          const r = shouldFireDrift(pos, currentWeight, tolerance);
          if (!r.shouldFire) continue;
          const key = buildDriftDedupeKey(pos.id, now);
          const exists = await notificationLogRepo.findByDedupeKey(key);
          if (exists.ok && exists.value === null) {
            pending.push({
              type: 'drift',
              title: 'Portfolio-Drift überschritten',
              body: `${pos.name}: ${currentWeight.toFixed(1)}% (Ziel ${pos.targetPercentage}% ±${tolerance}%) — Rebalancing erwägen`,
              dedupeKey: key,
              route: '/investments',
            });
          }
        }
      }
    }
  }

  // Fire BEFORE log: if log-insert fails we tolerate at most one duplicate
  // notification on the next dispatch run (better than silently dropping a real one).
  for (const n of pending) {
    const fireR = await fireNotification(n);
    if (fireR.ok) {
      await notificationLogRepo.insert({
        id: generateId(),
        type: n.type,
        dedupeKey: n.dedupeKey,
        firedAt: nowIso(),
      });
      debug('[notifications] fired', n.dedupeKey);
    } else {
      debugWarn('[notifications] failed to fire', n.dedupeKey, fireR.error);
    }
  }
}

function monthName(d: Date): string {
  return d.toLocaleString('de-DE', { month: 'long' });
}

interface FireResult {
  ok: boolean;
  error?: string;
}

async function fireNotification(n: DispatchedNotification): Promise<FireResult> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return { ok: false, error: 'permission-not-granted' };
  }
  if (!('serviceWorker' in navigator)) {
    return { ok: false, error: 'no-service-worker' };
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(n.title, {
      body: n.body,
      tag: n.dedupeKey,
      icon: '/smart-finance-companion/icon-192.png',
      badge: '/smart-finance-companion/icon-192.png',
      data: { route: n.route ?? '/' },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- Settings-UI helpers ----------

export async function enableNotifications(): Promise<{ granted: boolean }> {
  if (typeof Notification === 'undefined') return { granted: false };
  const result = await Notification.requestPermission();
  const granted = result === 'granted';
  await configRepo.setRaw(ALL_CONFIG_KEYS.notificationsEnabled, granted ? 'true' : 'false');
  return { granted };
}

export async function disableNotifications(): Promise<void> {
  await configRepo.setRaw(ALL_CONFIG_KEYS.notificationsEnabled, 'false');
}

export async function updateTriggers(triggers: Partial<NotificationTriggersConfig>): Promise<void> {
  const current = await loadTriggers();
  const merged = { ...current, ...triggers };
  await configRepo.setRaw(ALL_CONFIG_KEYS.notificationsTriggers, JSON.stringify(merged));
}

export async function loadTriggers(): Promise<NotificationTriggersConfig> {
  const r = await configRepo.getRaw(ALL_CONFIG_KEYS.notificationsTriggers);
  if (!r.ok || !r.value) return DEFAULT_TRIGGERS;
  try {
    return { ...DEFAULT_TRIGGERS, ...(JSON.parse(r.value) as Partial<NotificationTriggersConfig>) };
  } catch {
    return DEFAULT_TRIGGERS;
  }
}

export async function isNotificationsEnabled(): Promise<boolean> {
  const r = await configRepo.getRaw(ALL_CONFIG_KEYS.notificationsEnabled);
  return r.ok && r.value === 'true';
}
