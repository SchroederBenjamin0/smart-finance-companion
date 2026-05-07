import { getDB } from '../client';
import { tryAsync, ok, err, type Result } from '@/lib/result';
import { nowIso } from '@/lib/date';
import type { SecretEntry, SecretKey } from '../types';

export const secretsRepo = {
  async save(key: SecretKey, value: string): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      const entry: SecretEntry = {
        key,
        encryptedValue: value,
        iv: '',
        createdAt: nowIso(),
      };
      await db.put('secrets', entry);
    });
  },

  async get(key: SecretKey): Promise<Result<string | null>> {
    return tryAsync(async () => {
      const db = await getDB();
      const entry = await db.get('secrets', key);
      if (!entry) return null;
      if (entry.iv) {
        throw new Error(
          'Encrypted secret found — encryption support not yet implemented',
        );
      }
      return entry.encryptedValue;
    });
  },

  async exists(key: SecretKey): Promise<Result<boolean>> {
    const r = await this.get(key);
    if (!r.ok) return err(r.error);
    return ok(r.value !== null);
  },

  async remove(key: SecretKey): Promise<Result<void>> {
    return tryAsync(async () => {
      const db = await getDB();
      await db.delete('secrets', key);
    });
  },
};
