import { getDB } from '../client';
import { tryAsync, type Result } from '@/lib/result';
import type { NotificationLogEntry, NotificationTrigger } from '../types';

export const notificationLogRepo = {
  async findByDedupeKey(key: string): Promise<Result<NotificationLogEntry | null>> {
    return tryAsync(async () => {
      const db = await getDB();
      const hit = await db.getFromIndex('notificationLog', 'by-dedupeKey', key);
      return hit ?? null;
    });
  },

  async insert(entry: NotificationLogEntry): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      await db.put('notificationLog', entry);
    });
  },

  async findRecent(limit: number): Promise<Result<NotificationLogEntry[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      const all = await db.getAllFromIndex('notificationLog', 'by-firedAt');
      return all.reverse().slice(0, limit);
    });
  },

  async findByType(type: NotificationTrigger): Promise<Result<NotificationLogEntry[]>> {
    return tryAsync(async () => {
      const db = await getDB();
      return db.getAllFromIndex('notificationLog', 'by-type', type);
    });
  },

  async cleanOlderThan(days: number): Promise<Result<number>> {
    return tryAsync(async () => {
      const db = await getDB();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffIso = cutoff.toISOString();

      const tx = db.transaction('notificationLog', 'readwrite');
      const idx = tx.objectStore('notificationLog').index('by-firedAt');
      let cursor = await idx.openCursor(IDBKeyRange.upperBound(cutoffIso, true));
      let deleted = 0;
      while (cursor) {
        await cursor.delete();
        deleted += 1;
        cursor = await cursor.continue();
      }
      await tx.done;
      return deleted;
    });
  },
};
