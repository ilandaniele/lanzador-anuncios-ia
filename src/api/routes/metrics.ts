import { Hono } from "hono";
import {
  DEFAULT_RANGE,
  MAX_EXPORT_ROWS,
  metricsExportQuerySchema,
  metricsQuerySchema,
  refreshMetricsRequestSchema,
  topAdsQuerySchema,
  winningTagsQuerySchema,
} from "../../shared/schemas/metrics";
import { parseJson, parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
import { expensiveRateLimit } from "../middleware/rate-limit";
import { toCsv } from "../services/metrics/csv";
import { computeMetrics, listMetrics } from "../services/metrics/metrics";
import { refreshMetrics } from "../services/metrics/refresh";
import { topAds } from "../services/metrics/top-ads";
import { winningTags } from "../services/metrics/winning-tags";
import type { AppEnv } from "../types";

export const metricsRoutes = new Hono<AppEnv>()
  .get("/w/:wid/metrics", ...member("viewer"), async (c) =>
    c.json(
      await listMetrics(
        c.env,
        c.get("scope")!,
        parseQuery(c, metricsQuerySchema),
      ),
    ),
  )
  .get(
    "/w/:wid/metrics/export.csv",
    ...member("viewer"),
    expensiveRateLimit,
    async (c) => {
      const { rows } = await computeMetrics(
        c.env,
        c.get("scope")!,
        parseQuery(c, metricsExportQuerySchema),
      );
      return c.body(toCsv(rows.slice(0, MAX_EXPORT_ROWS)), 200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="metrics.csv"',
      });
    },
  )
  .post("/w/:wid/metrics/refresh", ...member("viewer"), async (c) => {
    const body = await parseJson(c, refreshMetricsRequestSchema);
    return c.json(
      await refreshMetrics(
        c.env,
        c.get("scope")!,
        body?.range ?? DEFAULT_RANGE,
        c.get("requestId"),
      ),
    );
  })
  .get("/w/:wid/metrics/top-ads", ...member("viewer"), async (c) =>
    c.json(
      await topAds(c.env, c.get("scope")!, parseQuery(c, topAdsQuerySchema)),
    ),
  )
  .get("/w/:wid/metrics/winning-tags", ...member("viewer"), async (c) =>
    c.json(
      await winningTags(
        c.env,
        c.get("scope")!,
        parseQuery(c, winningTagsQuerySchema),
      ),
    ),
  );
