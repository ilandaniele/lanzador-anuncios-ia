export const RANGE_PRESETS = [
  "today",
  "yesterday",
  "last_7d",
  "last_14d",
  "last_30d",
  "this_month",
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export type InsightRange =
  { preset: RangePreset } | { from: string; to: string };

export interface DateWindow {
  since: string;
  until: string;
}

export const MAX_RANGE_DAYS = 400;
const DAY_MS = 86_400_000;
const LAST_DAYS: Partial<Record<RangePreset, number>> = {
  last_7d: 7,
  last_14d: 14,
  last_30d: 30,
};

const invalidRange = () => new RangeError("RANGE_INVALID");

const dayNumber = (day: string): number => {
  const time = Date.parse(`${day}T00:00:00Z`);
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    !Number.isNaN(time) &&
    new Date(time).toISOString().startsWith(day);
  if (!valid) throw invalidRange();
  return time / DAY_MS;
};

const shiftDay = (day: string, days: number) =>
  new Date((dayNumber(day) + days) * DAY_MS).toISOString().slice(0, 10);

export const dayInZone = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

function customWindow(from: string, to: string, today: string): DateWindow {
  const days = dayNumber(to) - dayNumber(from) + 1;
  if (days < 1 || days > MAX_RANGE_DAYS || to > today) throw invalidRange();
  return { since: from, until: to };
}

function presetWindow(preset: RangePreset, today: string): DateWindow {
  const lastDays = LAST_DAYS[preset];
  if (lastDays) {
    return { since: shiftDay(today, -lastDays), until: shiftDay(today, -1) };
  }
  if (preset === "yesterday") {
    const yesterday = shiftDay(today, -1);
    return { since: yesterday, until: yesterday };
  }
  if (preset === "this_month") {
    return { since: `${today.slice(0, 8)}01`, until: today };
  }
  return { since: today, until: today };
}

export function resolveWindow(
  range: InsightRange,
  timezone: string,
  now: Date = new Date(),
): DateWindow {
  const today = dayInZone(now, timezone);
  if ("preset" in range) return presetWindow(range.preset, today);
  return customWindow(range.from, range.to, today);
}
