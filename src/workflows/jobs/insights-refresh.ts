import { NonRetryableError } from "cloudflare:workflows";
import { z } from "zod";
import {
  INSIGHT_CACHE_LEVELS,
  type InsightCacheLevel,
} from "../../api/repositories/insights-cache";
import type { Scope } from "../../api/repositories/scope";
import {
  enabledAdAccountIds,
  parseRangeKey,
  refreshInsights,
} from "../../api/services/insights/refresh";
import { JOB_STEP_CONFIG, type JobHandler } from "./job-context";

const PREWARM_LEVELS: InsightCacheLevel[] = ["account", "campaign", "health"];
const JOB_USER_ID = "job:insights_refresh";

const payloadSchema = z.object({
  adAccountAssetId: z.string().optional(),
  level: z.enum(INSIGHT_CACHE_LEVELS).optional(),
  rangeKey: z.string().default("today"),
});

const jobScope = (workspaceId: string): Scope => ({
  workspaceId,
  userId: JOB_USER_ID,
  role: "viewer",
});

export const insightsRefreshJob: JobHandler = async ({
  env,
  step,
  workspaceId,
  payload,
}) => {
  const parsed = payloadSchema.safeParse(payload);
  if (!workspaceId || !parsed.success) {
    throw new NonRetryableError("Invalid insights_refresh job");
  }
  const { adAccountAssetId, level, rangeKey } = parsed.data;
  parseRangeKey(rangeKey);
  const scope = jobScope(workspaceId);
  const levels = level ? [level] : PREWARM_LEVELS;
  const accountIds = adAccountAssetId
    ? [adAccountAssetId]
    : await step.do("list ad accounts", JOB_STEP_CONFIG, () =>
        enabledAdAccountIds(env.DB, scope),
      );

  const failures: unknown[] = [];
  for (const accountId of accountIds) {
    for (const target of levels) {
      await step
        .do(`refresh ${accountId} ${target}`, JOB_STEP_CONFIG, () =>
          refreshInsights(env, scope, {
            adAccountAssetId: accountId,
            level: target,
            rangeKey,
          }),
        )
        .catch((error: unknown) => failures.push(error));
    }
  }
  if (failures.length > 0) throw failures[0];
};
