/**
 * Detects "Heats" / tobacco purchases purely by amount. The user pays
 * either one pack (7.80 €) or two packs (15.60 €) at varying counterparties
 * (Lotto-Annahmestellen, Kiosks, Spätis, Tankstellen, Zigarettenautomaten).
 * To avoid maintaining a brittle counterparty allow-list, we match on the
 * exact amount instead. False positives at those amounts are accepted —
 * see the conversation around this feature.
 */
const HEATS_AMOUNTS_EUR = [7.8, 15.6] as const;
const AMOUNT_EPSILON = 0.005;

export function isHeatsAmount(amount: number): boolean {
  if (!Number.isFinite(amount)) return false;
  const abs = Math.abs(amount);
  return HEATS_AMOUNTS_EUR.some((t) => Math.abs(abs - t) < AMOUNT_EPSILON);
}

export const HEATS_CATEGORY = 'tabak';
