import type { InsightRange } from "../../../shared/insight-range";
import {
  METRICS_LEVELS,
  type RefreshMetricsResponse,
} from "../../../shared/schemas/metrics";
import type { Env } from "../../env";
import { AppError } from "../../lib/errors";
import { now } from "../../lib/time";
import { claimMetricsRefresh } from "../../repositories/metrics";
import type { Scope } from "../../repositories/scope";
import { refreshInsights, toRangeKey } from "../insights/refresh";
import { assertRange, listMetricsAccounts } from "./accounts";

const REFRESH_COOLDOWN_SEC = 60;

export async function refreshMetrics(
  env: Env,
  scope: Scope,
  range: InsightRange,
  requestId: string,
): Promise<RefreshMetricsResponse> {
  const at = now();
  const accounts = await listMetricsAccounts(env.DB, scope);
  assertRange(range, accounts, at);
  const claimed = await claimMetricsRefresh(env.DB, scope, {
    requestId,
    at,
    since: at - REFRESH_COOLDOWN_SEC * 1000,
  });
  if (!claimed) {
    throw new AppError(429, "RATE_LIMITED", {
      retryAfterSec: REFRESH_COOLDOWN_SEC,
    });
  }
  const results = await Promise.allSettled(
    accounts.flatMap(({ id }) =>
      METRICS_LEVELS.map((level) =>
        refreshInsights(
          env,
          scope,
          { adAccountAssetId: id, level, rangeKey: toRangeKey(range) },
          at,
          { force: true },
        ),
      ),
    ),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure && results.every((result) => result.status === "rejected")) {
    throw failure.reason;
  }
  return { updatedAt: new Date(at).toISOString() };
}
