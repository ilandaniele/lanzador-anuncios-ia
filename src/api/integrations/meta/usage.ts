import { isRecord, parseJson } from "./payload";

const USAGE_HEADERS = [
  "x-app-usage",
  "x-business-use-case-usage",
  "x-ad-account-usage",
  "x-fb-ads-insights-throttle",
];

const PERCENT_FIELDS = [
  "call_count",
  "total_cputime",
  "total_time",
  "acc_id_util_pct",
  "app_id_util_pct",
];

const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;

export interface MetaUsage {
  maxPercent: number;
  retryAfterMs?: number;
}

export type HeaderSource = Pick<Headers, "get">;

type UsageEntry = Record<string, unknown>;

const numberField = (entry: UsageEntry, field: string) => {
  const value = entry[field];
  const number =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : NaN;
  return Number.isFinite(number) ? number : 0;
};

function usageEntries(value: unknown): UsageEntry[] {
  if (Array.isArray(value)) return value.flatMap(usageEntries);
  if (!isRecord(value)) return [];
  return PERCENT_FIELDS.some((field) => field in value)
    ? [value]
    : Object.values(value).flatMap(usageEntries);
}

const entryPercent = (entry: UsageEntry) =>
  Math.max(...PERCENT_FIELDS.map((field) => numberField(entry, field)));

const entryWaitMs = (entry: UsageEntry) =>
  Math.max(
    numberField(entry, "estimated_time_to_regain_access") * MINUTE_MS,
    numberField(entry, "reset_time_duration") * SECOND_MS,
  );

export function readUsage(headers: HeaderSource): MetaUsage {
  const entries = USAGE_HEADERS.flatMap((name) =>
    usageEntries(parseJson(headers.get(name))),
  );
  const maxPercent = Math.max(0, ...entries.map(entryPercent));
  const waitMs = Math.max(0, ...entries.map(entryWaitMs));
  return waitMs > 0 ? { maxPercent, retryAfterMs: waitMs } : { maxPercent };
}
