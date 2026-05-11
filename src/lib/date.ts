export const nowIso = (): string => new Date().toISOString();

export const todayIso = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDayOfMonth = new Date(
    d.getFullYear(),
    d.getMonth() + 1,
    0,
  ).getDate();
  d.setDate(Math.min(day, lastDayOfMonth));
  return d.toISOString();
}

export function hoursSince(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}

export function daysSince(iso: string | null): number {
  return hoursSince(iso) / 24;
}

export function isFirstOfMonth(d: Date = new Date()): boolean {
  return d.getDate() === 1;
}

export function isQuarterStart(d: Date = new Date()): boolean {
  if (d.getDate() !== 1) return false;
  return [0, 3, 6, 9].includes(d.getMonth());
}

const monthNamesDe = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

export function formatMonthYearDe(d: Date = new Date()): string {
  return `${monthNamesDe[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateDe(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}
