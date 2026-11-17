const DAY_MS = 24 * 60 * 60 * 1000;

export function now(): number {
  return Date.now();
}

export const toIsoOrNull = (at: number | null) =>
  at === null ? null : new Date(at).toISOString();

export function utcPeriods(at: number) {
  const iso = new Date(at).toISOString();
  return {
    day: iso.slice(0, 10),
    month: iso.slice(0, 7),
    nextDayAt: (Math.floor(at / DAY_MS) + 1) * DAY_MS,
  };
}

export type UtcPeriods = ReturnType<typeof utcPeriods>;
