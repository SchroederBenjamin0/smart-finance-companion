import { tryAsync, type Result } from '@/lib/result';
import { configRepo } from '@/db/repositories/config';
import { hoursSince, nowIso } from '@/lib/date';

const CACHE_KEY = 'fx_rates_v1';
const MAX_AGE_HOURS = 24;

interface CachedRates {
  base: 'EUR';
  rates: Record<string, number>; // ratesTo[code] = how many EUR per 1 unit of code
  fetchedAt: string;
}

/**
 * Fetches the latest ECB rate for the given source currency, returning
 * how many EUR 1 unit of `from` is worth. Uses frankfurter.app (free,
 * no API key). Caches in appConfig for 24h.
 */
export async function getRateToEur(
  from: string,
): Promise<Result<number>> {
  const code = from.toUpperCase();
  if (code === 'EUR') return { ok: true, value: 1 };

  const cached = await configRepo.getJson<CachedRates>(CACHE_KEY);
  if (cached.ok && cached.value && hoursSince(cached.value.fetchedAt) < MAX_AGE_HOURS) {
    const r = cached.value.rates[code];
    if (typeof r === 'number' && r > 0) return { ok: true, value: r };
  }

  return tryAsync(async () => {
    const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(code)}&to=EUR`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FX error ${res.status}`);
    const data = (await res.json()) as { rates?: { EUR?: number } };
    const eurPer = data.rates?.EUR;
    if (typeof eurPer !== 'number' || eurPer <= 0) {
      throw new Error('FX response invalid');
    }

    // Merge into cache (preserve existing other-code rates from same fetch).
    const existing =
      cached.ok && cached.value ? cached.value : ({ base: 'EUR', rates: {}, fetchedAt: nowIso() } as CachedRates);
    const updated: CachedRates = {
      base: 'EUR',
      rates: { ...existing.rates, [code]: eurPer },
      fetchedAt: nowIso(),
    };
    await configRepo.setJson(CACHE_KEY, updated);
    return eurPer;
  });
}

export async function convertToEur(
  amount: number,
  from: string,
): Promise<number> {
  const r = await getRateToEur(from);
  if (!r.ok) return amount;
  return amount * r.value;
}
