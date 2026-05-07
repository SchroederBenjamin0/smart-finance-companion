import { getDB } from '../client';
import { tryAsync, ok, err, type Result } from '@/lib/result';
import { nowIso } from '@/lib/date';
import type { ConfigEntry } from '../types';

export const configRepo = {
  async getRaw(key: string): Promise<Result<string | null>> {
    return tryAsync(async () => {
      const db = await getDB();
      const entry = await db.get('appConfig', key);
      return entry?.value ?? null;
    });
  },

  async setRaw(key: string, value: string): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      const entry: ConfigEntry = { key, value, updatedAt: nowIso() };
      await db.put('appConfig', entry);
    });
  },

  async getJson<T>(key: string): Promise<Result<T | null>> {
    const raw = await this.getRaw(key);
    if (!raw.ok) return raw;
    if (raw.value === null) return ok(null);
    try {
      return ok(JSON.parse(raw.value) as T);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  },

  async setJson<T>(key: string, value: T): Promise<Result<void>> {
    return this.setRaw(key, JSON.stringify(value));
  },

  async remove(key: string): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      await db.delete('appConfig', key);
    });
  },
};
