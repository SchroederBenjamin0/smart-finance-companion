import { positionsRepo } from '@/db/repositories/positions';
import { tickerFromIsin } from '@/services/yahoo';

/**
 * Idempotent migration that maps each stored position's ticker to the
 * canonical Yahoo ticker for its ISIN. Catches positions that were
 * imported when the ISIN→ticker map was incomplete (e.g. early DAX
 * ETF used XDAX.DE instead of the correct DBXD.DE).
 */
export async function migrateTickers(): Promise<{ updated: number }> {
  const r = await positionsRepo.findAll();
  if (!r.ok) return { updated: 0 };
  let updated = 0;
  for (const p of r.value) {
    if (!p.isin) continue;
    const canonical = tickerFromIsin(p.isin);
    if (!canonical) continue;
    if (canonical.toUpperCase() === (p.ticker ?? '').toUpperCase()) continue;
    await positionsRepo.upsert({ ...p, ticker: canonical });
    updated += 1;
  }
  return { updated };
}
