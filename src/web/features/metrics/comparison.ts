import {
  dayNumber,
  resolveWindow,
  shiftDay,
} from "../../../shared/insight-range";
import type { MetricsFilters } from "./metrics-filters";

const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const dayAndMonth = (day: string) =>
  `${Number(day.slice(8))}/${Number(day.slice(5, 7))}`;

export function comparisonLabel(filters: MetricsFilters): string | null {
  const range =
    filters.range === "custom"
      ? { from: filters.from, to: filters.to }
      : { preset: filters.range };
  try {
    const { since, until } = resolveWindow(range, localTimeZone());
    const days = dayNumber(until) - dayNumber(since) + 1;
    return `${dayAndMonth(shiftDay(since, -days))}–${dayAndMonth(shiftDay(since, -1))}`;
  } catch {
    return null;
  }
}
