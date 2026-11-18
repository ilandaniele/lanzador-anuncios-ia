import { RANGE_PRESETS } from "../../../shared/insight-range";
import {
  METRICS_LEVELS,
  METRICS_SORT_KEYS,
  type MetricsLevel,
} from "../../../shared/schemas/metrics";
import type { Sort } from "../../components/DataTable";

export const RANGE_OPTIONS = [...RANGE_PRESETS, "custom"] as const;
export type RangeOption = (typeof RANGE_OPTIONS)[number];

export interface MetricsFilters {
  range: RangeOption;
  from: string;
  to: string;
  adAccountId: string;
  productId: string;
  level: MetricsLevel;
  sort: Sort | null;
}

export const DEFAULT_FILTERS: MetricsFilters = {
  range: "last_7d",
  from: "",
  to: "",
  adAccountId: "",
  productId: "",
  level: "campaign",
  sort: null,
};

export const DEFAULT_SORT: Sort = {
  key: "spendMinor",
  direction: "descending",
};

const FILTER_PARAMS = [
  "range",
  "from",
  "to",
  "adAccountIds",
  "productId",
  "level",
  "sort",
];

const oneOf = <Value extends string>(
  allowed: readonly Value[],
  raw: string | null,
  fallback: Value,
): Value => allowed.find((value) => value === raw) ?? fallback;

function parseSort(raw: string | null): Sort | null {
  const [key = "", direction] = (raw ?? "").split(":");
  if (!METRICS_SORT_KEYS.some((sortKey) => sortKey === key)) return null;
  return { key, direction: direction === "asc" ? "ascending" : "descending" };
}

export function parseFilters(params: URLSearchParams): MetricsFilters {
  return {
    range: oneOf(RANGE_OPTIONS, params.get("range"), DEFAULT_FILTERS.range),
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    adAccountId: params.get("adAccountIds") ?? "",
    productId: params.get("productId") ?? "",
    level: oneOf(METRICS_LEVELS, params.get("level"), DEFAULT_FILTERS.level),
    sort: parseSort(params.get("sort")),
  };
}

export function filtersToParams(filters: MetricsFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.range !== DEFAULT_FILTERS.range)
    params.set("range", filters.range);
  if (filters.range === "custom") {
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
  }
  if (filters.adAccountId) params.set("adAccountIds", filters.adAccountId);
  if (filters.productId) params.set("productId", filters.productId);
  if (filters.level !== DEFAULT_FILTERS.level)
    params.set("level", filters.level);
  if (filters.sort) {
    const direction = filters.sort.direction === "ascending" ? "asc" : "desc";
    params.set("sort", `${filters.sort.key}:${direction}`);
  }
  return params;
}

export function applyFilters(
  current: URLSearchParams,
  filters: MetricsFilters,
): URLSearchParams {
  const next = new URLSearchParams(current);
  FILTER_PARAMS.forEach((name) => next.delete(name));
  filtersToParams(filters).forEach((value, name) => next.set(name, value));
  return next;
}

export const isRangeComplete = ({ range, from, to }: MetricsFilters) =>
  range !== "custom" || (from !== "" && to !== "");
