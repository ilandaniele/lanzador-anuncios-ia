import {
  dayInZone,
  RANGE_PRESETS,
  shiftDay,
} from "../../../shared/insight-range";
import { toRangeKey } from "../insights/refresh";

const LAST_DAYS_KEY = /^(daily:)?last_(\d+)d$/;

const isPresetKey = (key: string) =>
  (RANGE_PRESETS as readonly string[]).includes(key.replace(/^daily:/, ""));

export function resolveRangeKey(
  rangeKey: string,
  timezone: string,
  at: number,
): string {
  const lastDays = LAST_DAYS_KEY.exec(rangeKey);
  if (isPresetKey(rangeKey) || !lastDays) return rangeKey;
  const today = dayInZone(new Date(at), timezone);
  const days = Number(lastDays[2]);
  return toRangeKey(
    { from: shiftDay(today, -days), to: shiftDay(today, -1) },
    lastDays[1] !== undefined,
  );
}
