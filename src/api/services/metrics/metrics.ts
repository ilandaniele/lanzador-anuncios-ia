import { type InsightRange } from "../../../shared/insight-range";
import {
  type DailyPointDto,
  type MetricsExportQuery,
  type MetricsQuery,
  type MetricsResponse,
  metricsRowSchema,
} from "../../../shared/schemas/metrics";
import type { Env } from "../../env";
import { AppError } from "../../lib/errors";
import { decodeCursor, paginate } from "../../lib/cursor";
import { toIsoOrNull, now } from "../../lib/time";
import type { InsightsCacheKey } from "../../repositories/insights-cache";
import type { Scope } from "../../repositories/scope";
import { toRangeKey } from "../insights/refresh";
import { assertRange, listMetricsAccounts } from "./accounts";
import {
  type AccountInsights,
  aggregateMetrics,
  type MetricsAggregation,
} from "./aggregate";
import { cachedEntry, loadCached, toAccountInsights } from "./cached-insights";
import { buildMetricsContext } from "./context";
import { dailySeries } from "./daily";
import { previousRange } from "./previous-range";

export interface MetricsComputation extends MetricsAggregation {
  daily?: DailyPointDto[];
  updatedAt: string | null;
  stale: boolean;
}

const keyOf = (
  adAccountAssetId: string,
  level: InsightsCacheKey["level"],
  rangeKey: string,
): InsightsCacheKey => ({ adAccountAssetId, level, rangeKey });

export async function computeMetrics(
  env: Env,
  scope: Scope,
  query: MetricsExportQuery,
  at: number = now(),
): Promise<MetricsComputation> {
  const { level, range, adAccountIds, productId, status, q, sort, daily } =
    query;
  const accounts = await listMetricsAccounts(env.DB, scope, adAccountIds);
  assertRange(range, accounts, at);

  const plans = accounts.map((account) => {
    const previous: InsightRange = previousRange(
      range,
      account.timezone,
      new Date(at),
    );
    return {
      account,
      current: keyOf(account.id, level, toRangeKey(range)),
      previous: keyOf(account.id, level, toRangeKey(previous)),
      daily: keyOf(account.id, "account", toRangeKey(range, true)),
    };
  });
  const cached = await loadCached(
    env,
    scope,
    plans.flatMap(({ current, previous, daily: dailyKey }) => [
      current,
      previous,
      ...(daily ? [dailyKey] : []),
    ]),
    at,
  );
  const insightsFor = (
    key: (plan: (typeof plans)[number]) => InsightsCacheKey,
  ) =>
    plans.flatMap((plan) =>
      toAccountInsights(plan.account, cachedEntry(cached, key(plan))),
    );
  const current = insightsFor(({ current: key }) => key);
  const dailyInsights: AccountInsights[] = daily
    ? insightsFor(({ daily: key }) => key)
    : [];

  const context = await buildMetricsContext(env, scope, {
    accounts,
    level,
    insights: current,
    at,
  });
  const entries = plans.flatMap(({ current: key }) => {
    const entry = cachedEntry(cached, key);
    return entry ? [entry] : [];
  });
  return {
    ...aggregateMetrics({
      accounts: current,
      previousAccounts: insightsFor(({ previous: key }) => key),
      context,
      filters: { productId, status, q },
      sort,
    }),
    ...(daily ? { daily: dailySeries(dailyInsights) } : {}),
    updatedAt: toIsoOrNull(
      entries.length
        ? Math.min(...entries.map((entry) => entry.updatedAt))
        : null,
    ),
    stale: entries.some((entry) => entry.stale),
  };
}

function pageAfter<Row extends { id: string }>(rows: Row[], cursor?: string) {
  if (!cursor) return rows;
  const index = rows.findIndex(({ id }) => id === decodeCursor(cursor).id);
  if (index === -1) {
    throw new AppError(400, "VALIDATION", { fields: { cursor: "invalid" } });
  }
  return rows.slice(index + 1);
}

export async function listMetrics(
  env: Env,
  scope: Scope,
  { cursor, limit, ...query }: MetricsQuery,
): Promise<MetricsResponse> {
  const { rows, totals, previousTotals, daily, updatedAt, stale } =
    await computeMetrics(env, scope, query);
  const page = paginate(pageAfter(rows, cursor).slice(0, limit + 1), limit);
  return {
    data: page.rows.map((row) => metricsRowSchema.parse(row)),
    totals,
    previousTotals,
    ...(daily ? { daily } : {}),
    updatedAt,
    stale,
    nextCursor: page.nextCursor,
  };
}
