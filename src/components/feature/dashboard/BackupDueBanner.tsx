import { useEffect, useState } from 'react';
import { configRepo } from '@/db/repositories/config';
import { ALL_CONFIG_KEYS } from '@/db/types';
import { exportBackup } from '@/modules/backup';

const SNOOZE_KEY = 'backup_due_snoozed_until';

export function BackupDueBanner() {
  const [show, setShow] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    void (async () => {
      const lastR = await configRepo.getRaw(ALL_CONFIG_KEYS.lastBackup);
      const snoozeR = await configRepo.getRaw(SNOOZE_KEY);
      const now = Date.now();
      if (snoozeR.ok && snoozeR.value && Number(snoozeR.value) > now) return;
      const lastMs =
        lastR.ok && lastR.value ? new Date(lastR.value).getTime() : 0;
      const fourteenDaysMs = 14 * 86400000;
      if (now - lastMs > fourteenDaysMs) setShow(true);
    })();
  }, []);

  const handleSnooze = () => {
    const threeDaysFromNow = Date.now() + 3 * 86400000;
    void configRepo.setRaw(SNOOZE_KEY, String(threeDaysFromNow));
    setShow(false);
  };

  const handleBackup = async () => {
    setRunning(true);
    const r = await exportBackup();
    setRunning(false);
    if (r.ok) setShow(false);
  };

  if (!show) return null;

  return (
    <div className="mb-3 rounded-[16px] border border-forest-200 bg-forest-50 p-4 text-forest-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-[14px] font-semibold">📦 Backup fällig</div>
          <div className="mt-1 text-[12px]">
            Letztes Backup ist über 14 Tage alt. Sicher dir jetzt einen Export.
          </div>
          <button
            type="button"
            onClick={() => void handleBackup()}
            disabled={running}
            className="mt-2 rounded-full bg-forest-700 px-3 py-1 text-[12px] font-medium text-white disabled:opacity-50"
          >
            {running ? 'Exportiere...' : 'Jetzt sichern'}
          </button>
        </div>
        <button
          type="button"
          onClick={handleSnooze}
          className="text-[12px] underline"
        >
          3 Tage später
        </button>
      </div>
    </div>
  );
}
