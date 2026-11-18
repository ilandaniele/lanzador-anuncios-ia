import type { InsightRange } from "../../../shared/insight-range";
import type { Env } from "../../env";
import type { InsightsCacheKey } from "../../repositories/insights-cache";
import type { Scope } from "../../repositories/scope";
import { toRangeKey } from "../insights/refresh";
import { assertRange, listMetricsAccounts } from "./accounts";
import {
  buildMetricsRows,
  type MetricsContext,
  type MetricsRow,
} from "./aggregate";
import { cachedEntry, loadCached, toAccountInsights } from "./cached-insights";

const emptyContext = (at: number): MetricsContext => ({
  entities: new Map(),
  productByCampaign: new Map(),
  protectedCampaignIds: new Set(),
  lastScaledAt: new Map(),
  now: at,
});

export async function loadAdRows(
  env: Env,
  scope: Scope,
  range: InsightRange,
  at: number,
): Promise<MetricsRow[]> {
  const accounts = await listMetricsAccounts(env.DB, scope);
  assertRange(range, accounts, at);
  const keyOf = ({ id }: { id: string }): InsightsCacheKey => ({
    adAccountAssetId: id,
    level: "ad",
    rangeKey: toRangeKey(range),
  });
  const cached = await loadCached(env, scope, accounts.map(keyOf), at);
  return accounts.flatMap((account) =>
    toAccountInsights(account, cachedEntry(cached, keyOf(account))).flatMap(
      (insights) => buildMetricsRows(insights, emptyContext(at)),
    ),
  );
}
