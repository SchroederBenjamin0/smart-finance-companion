import { configRepo } from '@/db/repositories/config';
import { incomeRepo } from '@/db/repositories/income';
import { notificationLogRepo } from '@/db/repositories/notificationLog';
import { positionsRepo } from '@/db/repositories/positions';
import { subscriptionsRepo } from '@/db/repositories/subscriptions';
import { transactionsRepo } from '@/db/repositories/transactions';
import { accountsRepo } from '@/db/repositories/accounts';
import { ALL_CONFIG_KEYS, type NotificationTrigger } from '@/db/types';
import { generateId } from '@/lib/id';
import { nowIso } from '@/lib/date';
import { debug, debugWarn } from '@/lib/debug';
import { forecastCashflow } from '@/modules/forecast';
import {
  shouldFireAllocation,
  shouldFireSubscription,
  shouldFireDrift,
  shouldFireCashflow,
  buildAllocationDedupeKey,
  buildSubscriptionDedupeKey,
  buildDriftDedupeKey,
  buildCashflowDedupeKey,
  buildAnomalyDedupeKey,
} from './triggers';

export interface NotificationTriggersConfig {
  allocation: boolean;
  subscription: boolean;
  drift: boolean;
  anomaly: boolean;
  cashflow: boolean;
}

// DEFAULT_TRIGGERS keeps anomaly + cashflow as `true` on purpose: the Settings UI
// (Task 11) reads these defaults to populate sub-toggles.
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

/**
 * Public helper for one-off notifications (called outside the watchdog).
 * Checks dedupe, fires the notification, and writes the log entry.
 */
export async function fireAndLog(notification: {
  type: NotificationTrigger;
  title: string;
  body: string;
  dedupeKey: string;
  route?: string;
}): Promise<void> {
  const exists = await notificationLogRepo.findByDedupeKey(notification.dedupeKey);
  if (exists.ok && exists.value !== null) return;

  const fireR = await fireNotification(notification);
  if (fireR.ok) {
    await notificationLogRepo.insert({
      id: generateId(),
      type: notification.type,
      dedupeKey: notification.dedupeKey,
      firedAt: nowIso(),
    });
    debug('[notifications] fired', notification.dedupeKey);
  } else {
    debugWarn('[notifications] failed to fire', notification.dedupeKey, fireR.error);
  }
}

/**
 * Fire an anomaly notification for a given CSV import, if anomalies were detected.
 * Called from the CSV import flow after anomaly detection.
 */
export async function notifyAnomalies(csvImportId: string, anomalyCount: number): Promise<void> {
  if (anomalyCount === 0) return;
  if (!(await isNotificationsEnabled())) return;
  const triggers = await loadTriggers();
  if (!triggers.anomaly) return;
  await fireAndLog({
    type: 'anomaly',
    title: 'Auffällige Ausgaben',
    body: `${anomalyCount} ${anomalyCount === 1 ? 'auffällige Ausgabe' : 'auffällige Ausgaben'} beim Import erkannt`,
    dedupeKey: buildAnomalyDedupeKey(csvImportId),
    route: '/dashboard',
  });
}

/**
 * Called by the watchdog on app-start. Checks all enabled triggers,
 * fires notifications when conditions met, and writes each fired notification
 * to notificationLog (dedupe).
 */
export async function dispatchPendingNotifications(): Promise<void> {
  const enabledR = await configRepo.getRaw(ALL_CONFIG_KEYS.notificationsEnabled);
  if (!enabledR.ok || enabledR.value !== 'true') return;

  const triggers = await loadTriggers();
  const now = new Date();

  if (triggers.allocation) {
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const incomeR = await incomeRepo.findSince(startOfMonth);
    if (incomeR.ok) {
      const r = shouldFireAllocation({ now, incomeEntriesThisMonth: incomeR.value });
      if (r.shouldFire) {
        await fireAndLog({
          type: 'allocation',
          title: 'Allokation fällig',
          body: r.overdueDays > 0
            ? `Allokation für diesen Monat seit ${r.overdueDays} Tagen offen`
            : `Allokation für ${monthName(now)} starten`,
          dedupeKey: buildAllocationDedupeKey(now),
          route: '/income',
        });
      }
    }
  }

  if (triggers.subscription) {
    const subsR = await subscriptionsRepo.findActive();
    if (subsR.ok) {
      for (const sub of subsR.value) {
        const r = shouldFireSubscription(sub, now);
        if (!r.shouldFire) continue;
        await fireAndLog({
          type: 'subscription',
          title: 'Abo-Abbuchung steht an',
          body: r.daysUntil === 0
            ? `${sub.name} bucht heute ${sub.amount.toFixed(2)} ${sub.currency} ab`
            : `${sub.name} bucht in ${r.daysUntil} Tagen ${sub.amount.toFixed(2)} ${sub.currency} ab`,
          dedupeKey: buildSubscriptionDedupeKey(sub.id, sub.nextBillDate),
          route: '/subscriptions',
        });
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
          await fireAndLog({
            type: 'drift',
            title: 'Portfolio-Drift überschritten',
            body: `${pos.name}: ${currentWeight.toFixed(1)}% (Ziel ${pos.targetPercentage}% ±${tolerance}%) — Rebalancing erwägen`,
            dedupeKey: buildDriftDedupeKey(pos.id, now),
            route: '/investments',
          });
        }
      }
    }
  }

  if (triggers.cashflow) {
    const ninetyAgoIso = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
    const [accountsR, subsR, txsR, incomeR, thresholdR] = await Promise.all([
      accountsRepo.findAll(),
      subscriptionsRepo.findActive(),
      transactionsRepo.findRecent(5000),
      incomeRepo.findSince(ninetyAgoIso),
      configRepo.getRaw(ALL_CONFIG_KEYS.cashflowFunWarnThreshold),
    ]);
    if (accountsR.ok && subsR.ok && txsR.ok && incomeR.ok) {
      const threshold = thresholdR.ok && thresholdR.value ? Number(thresholdR.value) : 100;
      const forecast = forecastCashflow({
        accounts: accountsR.value,
        subscriptions: subsR.value,
        transactions: txsR.value,
        incomeEntries: incomeR.value,
        weeks: 13,
        now,
      });
      const points = forecast.map((f) => ({ weekStartIso: f.weekStartIso, funBalance: f.funBalance }));
      const r = shouldFireCashflow(points, threshold);
      if (r.shouldFire) {
        const key = buildCashflowDedupeKey(now);
        const body = r.earliestWeek
          ? (r.severity === 'red'
              ? `Fun-Konto droht unter 0 € zu fallen ab Woche ${r.earliestWeek}`
              : `Fun-Konto droht unter ${threshold} € zu fallen ab Woche ${r.earliestWeek}`)
          : 'Cashflow überprüfen';
        await fireAndLog({
          type: 'cashflow',
          title: r.severity === 'red' ? '⚠️ Cashflow-Warnung' : 'Cashflow-Hinweis',
          body,
          dedupeKey: key,
          route: '/stats',
        });
      }
    }
  }
}

function monthName(d: Date): string {
  return d.toLocaleString('de-DE', { month: 'long' });
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
