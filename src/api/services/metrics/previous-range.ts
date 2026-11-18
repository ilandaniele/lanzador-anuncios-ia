import {
  type DateWindow,
  dayNumber,
  type InsightRange,
  resolveWindow,
  shiftDay,
} from "../../../shared/insight-range";

export function previousWindow({ since, until }: DateWindow): DateWindow {
  const days = dayNumber(until) - dayNumber(since) + 1;
  return { since: shiftDay(since, -days), until: shiftDay(since, -1) };
}

export function previousRange(
  range: InsightRange,
  timezone: string,
  now: Date = new Date(),
): InsightRange {
  const { since, until } = previousWindow(resolveWindow(range, timezone, now));
  return { from: since, to: until };
}
