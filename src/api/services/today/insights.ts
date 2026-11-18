import type { Env } from "../../env";
import type { AccountHealth, AdWithIssues } from "../../integrations/meta/read";
import type { InsightsCacheKey } from "../../repositories/insights-cache";
import type { Scope } from "../../repositories/scope";
import { toRangeKey } from "../insights/refresh";
import { listMetricsAccounts, type MetricsAccount } from "../metrics/accounts";
import type { AccountInsights } from "../metrics/aggregate";
import {
  cachedEntry,
  loadCached,
  toAccountInsights,
} from "../metrics/cached-insights";

export interface AccountView {
  account: MetricsAccount;
  today: AccountInsights[];
  yesterday: AccountInsights[];
  health: AccountHealth | undefined;
  issues: AdWithIssues[];
}

export interface TodayInsights {
  views: AccountView[];
  updatedAt: number | null;
  stale: boolean;
}

const keyOf = (
  { id }: MetricsAccount,
  level: InsightsCacheKey["level"],
  preset: "today" | "yesterday",
): InsightsCacheKey => ({
  adAccountAssetId: id,
  level,
  rangeKey: toRangeKey({ preset }),
});

export async function loadTodayInsights(
  env: Env,
  scope: Scope,
  at: number,
): Promise<TodayInsights> {
  const accounts = await listMetricsAccounts(env.DB, scope);
  const plans = accounts.map((account) => ({
    account,
    keys: {
      today: keyOf(account, "account", "today"),
      yesterday: keyOf(account, "account", "yesterday"),
      health: keyOf(account, "health", "today"),
      issues: keyOf(account, "issues", "today"),
    },
  }));
  const keys = plans.flatMap(({ keys: planKeys }) => Object.values(planKeys));
  const cached = await loadCached(env, scope, keys, at);
  const views = plans.map(({ account, keys: planKeys }): AccountView => {
    const [health] = cachedEntry(cached, planKeys.health)?.rows ?? [];
    return {
      account,
      today: toAccountInsights(account, cachedEntry(cached, planKeys.today)),
      yesterday: toAccountInsights(
        account,
        cachedEntry(cached, planKeys.yesterday),
      ),
      health: health as AccountHealth | undefined,
      issues: (cachedEntry(cached, planKeys.issues)?.rows ??
        []) as AdWithIssues[],
    };
  });
  const entries = keys.flatMap((key) => cachedEntry(cached, key) ?? []);
  return {
    views,
    updatedAt: entries.length
      ? Math.min(...entries.map(({ updatedAt }) => updatedAt))
      : null,
    stale: entries.length < keys.length || entries.some(({ stale }) => stale),
  };
}
