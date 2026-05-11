import { useEffect, useState } from 'react';
import { AlertTriangle, Bell, BellOff, Repeat2, ShoppingBag, TrendingUp, Upload, Wallet, type LucideIcon } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import {
  enableNotifications,
  disableNotifications,
  updateTriggers,
  loadTriggers,
  isNotificationsEnabled,
  type NotificationTriggersConfig,
} from '@/modules/notifications';

const TRIGGER_LABELS: { key: keyof NotificationTriggersConfig; label: string; Icon: LucideIcon }[] = [
  { key: 'allocation', label: 'Monatliche Allokations-Erinnerung', Icon: Wallet },
  { key: 'subscription', label: 'Fällige Abos (3 Tage vorher)', Icon: Repeat2 },
  { key: 'drift', label: 'Portfolio-Drift', Icon: TrendingUp },
  { key: 'anomaly', label: 'Anomalie beim CSV-Import', Icon: Upload },
  { key: 'cashflow', label: 'Cashflow-Warnung', Icon: ShoppingBag },
];

export function NotificationsSection() {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [triggers, setTriggersState] = useState<NotificationTriggersConfig>({
    allocation: true,
    subscription: true,
    drift: true,
    anomaly: true,
    cashflow: true,
  });

  useEffect(() => {
    void (async () => {
      setEnabled(await isNotificationsEnabled());
      setTriggersState(await loadTriggers());
      if (typeof Notification !== 'undefined') setPermission(Notification.permission);
    })();
  }, []);

  const onMasterToggle = async (next: boolean) => {
    if (next) {
      const r = await enableNotifications();
      setEnabled(r.granted);
      if (typeof Notification !== 'undefined') setPermission(Notification.permission);
    } else {
      await disableNotifications();
      setEnabled(false);
    }
  };

  const onTriggerToggle = async (key: keyof NotificationTriggersConfig, next: boolean) => {
    const merged = { ...triggers, [key]: next };
    setTriggersState(merged);
    await updateTriggers({ [key]: next });
  };

  return (
    <div className="mt-5">
      <h2 className="mb-2 ml-1 text-[12px] font-semibold uppercase tracking-wider text-ink-subtle">
        Benachrichtigungen
      </h2>
      <div className="row-divider overflow-hidden rounded-[22px] bg-white shadow-card">
        {/* Master toggle row */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-800">
            {enabled ? (
              <Bell className="h-4.5 w-4.5" strokeWidth={2.25} />
            ) : (
              <BellOff className="h-4.5 w-4.5" strokeWidth={2.25} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink">
              Notifications aktivieren
            </div>
            {permission === 'denied' ? (
              <div className="text-[12px] text-red-600">
                Berechtigung verweigert
              </div>
            ) : (
              <div className="text-[12px] text-ink-subtle">
                {permission === 'granted' ? 'Berechtigung erteilt' : 'Noch nicht angefragt'}
              </div>
            )}
          </div>
          <Switch
            checked={enabled}
            onChange={(next) => void onMasterToggle(next)}
            ariaLabel="Notifications aktivieren"
          />
        </div>

        {/* Permission-denied hint */}
        {permission === 'denied' && (
          <div className="mx-4 mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={2.25} />
            <p className="text-[12px] text-amber-800">
              Benachrichtigungen sind in iOS-Einstellungen blockiert. Öffne{' '}
              <strong>Einstellungen → Safari → Mitteilungen</strong> und erlaube
              Benachrichtigungen für diese App.
            </p>
          </div>
        )}

        {/* Sub-toggles — only visible when enabled */}
        {enabled &&
          TRIGGER_LABELS.map(({ key, label, Icon }) => (
            <div key={key} className="flex items-center gap-3 px-4 py-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-800">
                <Icon className="h-4.5 w-4.5" strokeWidth={2.25} />
              </div>
              <div className="min-w-0 flex-1 text-[14px] font-medium text-ink">
                {label}
              </div>
              <Switch
                checked={triggers[key]}
                onChange={(next) => void onTriggerToggle(key, next)}
                ariaLabel={label}
              />
            </div>
          ))}
      </div>
    </div>
  );
}
