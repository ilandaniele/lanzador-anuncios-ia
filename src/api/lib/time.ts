export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export function now(): number {
  return Date.now();
}

export const toIsoOrNull = (at: number | null) =>
  at === null ? null : new Date(at).toISOString();

export function utcPeriods(at: number) {
  const date = new Date(at);
  const iso = date.toISOString();
  return {
    day: iso.slice(0, 10),
    month: iso.slice(0, 7),
    nextDayAt: (Math.floor(at / DAY_MS) + 1) * DAY_MS,
    nextMonthAt: Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
  };
}

export type UtcPeriods = ReturnType<typeof utcPeriods>;
