import { cpaMinor, cpmMinor, ctr, roas } from "../../../shared/metrics";
import type { InsightLevel, InsightRow } from "../../integrations/meta/read";

const HOUR_MS = 3_600_000;

export const METRICS_SORT_KEYS = [
  "name",
  "spendMinor",
  "purchases",
  "purchaseValueMinor",
  "roas",
  "cpaMinor",
  "ctr",
  "cpmMinor",
] as const;
export type MetricsSortKey = (typeof METRICS_SORT_KEYS)[number];

export interface MetricsSort {
  key: MetricsSortKey;
  direction: "asc" | "desc";
}

export const DEFAULT_METRICS_SORT: MetricsSort = {
  key: "spendMinor",
  direction: "desc",
};

export interface MetricsFilters {
  adAccountIds?: string[];
  productId?: string;
  status?: string;
  q?: string;
}

export interface AccountInsights {
  adAccountId: string;
  currency: string;
  rows: unknown[];
}

export interface EntityInfo {
  status: string;
  dailyBudgetMinor: number | null;
}

export interface MetricsContext {
  entities: ReadonlyMap<string, EntityInfo>;
  productByCampaign: ReadonlyMap<string, string>;
  protectedCampaignIds: ReadonlySet<string>;
  lastScaledAt: ReadonlyMap<string, number>;
  now: number;
}

interface Counters {
  spendMinor: number;
  impressions: number;
  clicks: number;
  purchases: number;
  purchaseValueMinor: number;
}

interface Ratios {
  roas: number | null;
  cpaMinor: number | null;
  ctr: number | null;
  cpmMinor: number | null;
}

export interface MetricsRow extends Counters, Ratios {
  id: string;
  name: string;
  level: InsightLevel;
  status: string | null;
  adAccountId: string;
  currency: string;
  productId?: string;
  dailyBudgetMinor?: number;
  protected: boolean;
  scaledHoursAgo?: number;
}

export interface MetricsTotals extends Counters, Ratios {
  currency: string;
}

export interface MetricsAggregation {
  rows: MetricsRow[];
  totals: MetricsTotals[];
  previousTotals: MetricsTotals[];
}

export interface AggregateInput {
  accounts: AccountInsights[];
  previousAccounts: AccountInsights[];
  context: MetricsContext;
  filters: MetricsFilters;
  sort?: MetricsSort;
}

const ZERO: Counters = {
  spendMinor: 0,
  impressions: 0,
  clicks: 0,
  purchases: 0,
  purchaseValueMinor: 0,
};

const addCounters = (a: Counters, b: Counters): Counters => ({
  spendMinor: a.spendMinor + b.spendMinor,
  impressions: a.impressions + b.impressions,
  clicks: a.clicks + b.clicks,
  purchases: a.purchases + b.purchases,
  purchaseValueMinor: a.purchaseValueMinor + b.purchaseValueMinor,
});

const withRatios = (counters: Counters): Counters & Ratios => ({
  ...counters,
  roas: roas(counters.purchaseValueMinor, counters.spendMinor),
  cpaMinor: cpaMinor(counters.spendMinor, counters.purchases),
  ctr: ctr(counters.clicks, counters.impressions),
  cpmMinor: cpmMinor(counters.spendMinor, counters.impressions),
});

const campaignOf = (row: InsightRow) =>
  row.level === "campaign" ? row.id : row.campaignId;

function toMetricsRow(
  account: AccountInsights,
  first: InsightRow,
  counters: Counters,
  context: MetricsContext,
): MetricsRow {
  const campaignId = campaignOf(first);
  const productId = campaignId && context.productByCampaign.get(campaignId);
  const entity = context.entities.get(first.id);
  const scaledAt = context.lastScaledAt.get(first.id);
  return {
    ...withRatios(counters),
    id: first.id,
    name: first.name ?? first.id,
    level: first.level,
    status: entity?.status ?? null,
    adAccountId: account.adAccountId,
    currency: account.currency,
    ...(productId ? { productId } : {}),
    ...(entity?.dailyBudgetMinor == null
      ? {}
      : { dailyBudgetMinor: entity.dailyBudgetMinor }),
    protected:
      campaignId !== null && context.protectedCampaignIds.has(campaignId),
    ...(scaledAt === undefined
      ? {}
      : {
          scaledHoursAgo: Math.max(
            0,
            Math.floor((context.now - scaledAt) / HOUR_MS),
          ),
        }),
  };
}

export function buildMetricsRows(
  account: AccountInsights,
  context: MetricsContext,
): MetricsRow[] {
  const merged = new Map<string, { first: InsightRow; counters: Counters }>();
  for (const row of account.rows as InsightRow[]) {
    const entry = merged.get(row.id);
    merged.set(row.id, {
      first: entry?.first ?? row,
      counters: addCounters(entry?.counters ?? ZERO, row),
    });
  }
  return [...merged.values()].map(({ first, counters }) =>
    toMetricsRow(account, first, counters, context),
  );
}

export function filterMetricsRows(
  rows: MetricsRow[],
  { adAccountIds, productId, status, q }: MetricsFilters,
): MetricsRow[] {
  const needle = q?.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (!adAccountIds || adAccountIds.includes(row.adAccountId)) &&
      (!productId || row.productId === productId) &&
      (!status || row.status === status) &&
      (!needle ||
        row.name.toLowerCase().includes(needle) ||
        row.id.toLowerCase().includes(needle)),
  );
}

const compareValues = (
  a: string | number | null,
  b: string | number | null,
  direction: MetricsSort["direction"],
): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const order = a < b ? -1 : 1;
  return direction === "asc" ? order : -order;
};

export function sortMetricsRows(
  rows: MetricsRow[],
  { key, direction }: MetricsSort = DEFAULT_METRICS_SORT,
): MetricsRow[] {
  return [...rows].sort(
    (a, b) =>
      compareValues(a[key], b[key], direction) ||
      compareValues(a.id, b.id, "asc"),
  );
}

export function totalsByCurrency(rows: MetricsRow[]): MetricsTotals[] {
  const sums = new Map<string, Counters>();
  for (const row of rows) {
    sums.set(row.currency, addCounters(sums.get(row.currency) ?? ZERO, row));
  }
  return [...sums.entries()]
    .sort(([a], [b]) => compareValues(a, b, "asc"))
    .map(([currency, counters]) => ({ currency, ...withRatios(counters) }));
}

const selectRows = (
  accounts: AccountInsights[],
  context: MetricsContext,
  filters: MetricsFilters,
) =>
  filterMetricsRows(
    accounts.flatMap((account) => buildMetricsRows(account, context)),
    filters,
  );

export function aggregateMetrics(input: AggregateInput): MetricsAggregation {
  const { accounts, previousAccounts, context, filters, sort } = input;
  const rows = selectRows(accounts, context, filters);
  return {
    rows: sortMetricsRows(rows, sort),
    totals: totalsByCurrency(rows),
    previousTotals: totalsByCurrency(
      selectRows(previousAccounts, context, filters),
    ),
  };
}
