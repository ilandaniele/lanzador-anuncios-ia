import { z } from "zod";
import { type InsightRange, RANGE_PRESETS } from "../insight-range";
import { commaList, currencySchema, paginationQuerySchema } from "./common";

export const METRICS_LEVELS = ["account", "campaign", "adset", "ad"] as const;
export type MetricsLevel = (typeof METRICS_LEVELS)[number];

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

export const TAG_DIMENSIONS = [
  "hook",
  "angle",
  "format",
  "language",
  "onScreenText",
] as const;
export type TagDimension = (typeof TAG_DIMENSIONS)[number];

export const DEFAULT_RANGE: InsightRange = { preset: "last_7d" };
export const MAX_EXPORT_ROWS = 5000;

const AD_ACCOUNT_IDS_MAX = 100;
const FILTER_MAX = 120;
const MIN_SPEND_DEFAULT_MINOR = 1000;
const TOP_ADS_MAX = 50;
const TOP_ADS_DEFAULT = 16;

const rangeShape = {
  range: z.enum([...RANGE_PRESETS, "custom"]).default(DEFAULT_RANGE.preset),
  from: z.string().optional(),
  to: z.string().optional(),
};

type RangeFields = z.infer<z.ZodObject<typeof rangeShape>>;

function resolveRange<Fields extends RangeFields>(
  { range, from, to, ...rest }: Fields,
  ctx: z.core.$RefinementCtx,
) {
  if (range !== "custom") {
    return { ...rest, range: { preset: range } as InsightRange };
  }
  if (!from || !to) {
    ctx.addIssue({ code: "custom", path: ["from"], message: "required" });
    return z.NEVER;
  }
  return { ...rest, range: { from, to } as InsightRange };
}

const sortSchema = z
  .string()
  .transform((raw) => {
    const [key, direction = "desc"] = raw.split(":");
    return { key, direction };
  })
  .pipe(
    z.object({
      key: z.enum(METRICS_SORT_KEYS),
      direction: z.enum(["asc", "desc"]),
    }),
  );

const dailyFlagSchema = z
  .enum(["true", "false"])
  .transform((flag) => flag === "true");

const metricsFilterShape = {
  ...rangeShape,
  level: z.enum(METRICS_LEVELS).default("campaign"),
  adAccountIds: commaList(
    z.string().min(1).max(64),
    AD_ACCOUNT_IDS_MAX,
  ).optional(),
  productId: z.string().min(1).max(64).optional(),
  status: z.string().trim().min(1).max(FILTER_MAX).optional(),
  q: z.string().trim().min(1).max(FILTER_MAX).optional(),
  sort: sortSchema.optional(),
  daily: dailyFlagSchema.optional(),
};

export const metricsQuerySchema = z
  .object({ ...metricsFilterShape, ...paginationQuerySchema.shape })
  .transform(resolveRange);
export type MetricsQuery = z.infer<typeof metricsQuerySchema>;

export const metricsExportQuerySchema = z
  .object(metricsFilterShape)
  .transform(resolveRange);
export type MetricsExportQuery = z.infer<typeof metricsExportQuerySchema>;

export const topAdsQuerySchema = z
  .object({
    ...rangeShape,
    minSpendMinor: z.coerce
      .number()
      .int()
      .min(0)
      .default(MIN_SPEND_DEFAULT_MINOR),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(TOP_ADS_MAX)
      .default(TOP_ADS_DEFAULT),
  })
  .transform(resolveRange);
export type TopAdsQuery = z.infer<typeof topAdsQuerySchema>;

export const winningTagsQuerySchema = z
  .object({ ...rangeShape, dimension: z.enum(TAG_DIMENSIONS) })
  .transform(resolveRange);
export type WinningTagsQuery = z.infer<typeof winningTagsQuerySchema>;

export const refreshMetricsRequestSchema = z
  .object(rangeShape)
  .transform(resolveRange)
  .optional();

const ratio = z.number().nullable();

const counters = {
  spendMinor: z.number().int(),
  purchases: z.number().int(),
  purchaseValueMinor: z.number().int(),
  roas: ratio,
  cpaMinor: z.number().int().nullable(),
  ctr: ratio,
  cpmMinor: z.number().int().nullable(),
};

export const metricsRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.enum(METRICS_LEVELS),
  status: z.string().nullable(),
  adAccountId: z.string(),
  currency: currencySchema,
  productId: z.string().optional(),
  dailyBudgetMinor: z.number().int().optional(),
  ...counters,
  protected: z.boolean(),
  scaledHoursAgo: z.number().int().optional(),
});
export type MetricsRowDto = z.infer<typeof metricsRowSchema>;

export const metricsTotalsSchema = z.object({
  currency: currencySchema,
  impressions: z.number().int(),
  clicks: z.number().int(),
  ...counters,
});
export type MetricsTotalsDto = z.infer<typeof metricsTotalsSchema>;

export const dailyPointSchema = z.object({
  date: z.string(),
  currency: currencySchema,
  spendMinor: z.number().int(),
  purchases: z.number().int(),
  purchaseValueMinor: z.number().int(),
  roas: ratio,
});
export type DailyPointDto = z.infer<typeof dailyPointSchema>;

export const metricsResponseSchema = z.object({
  data: z.array(metricsRowSchema),
  totals: z.array(metricsTotalsSchema),
  previousTotals: z.array(metricsTotalsSchema),
  daily: z.array(dailyPointSchema).optional(),
  updatedAt: z.iso.datetime().nullable(),
  stale: z.boolean(),
  nextCursor: z.string().nullable(),
});
export type MetricsResponse = z.infer<typeof metricsResponseSchema>;

export const topAdSchema = z.object({
  adId: z.string(),
  name: z.string(),
  adAccountId: z.string(),
  currency: currencySchema,
  storyId: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  spendMinor: z.number().int(),
  roas: ratio,
  purchases: z.number().int(),
});
export type TopAdDto = z.infer<typeof topAdSchema>;

export const topAdsResponseSchema = z.object({ data: z.array(topAdSchema) });
export type TopAdsResponse = z.infer<typeof topAdsResponseSchema>;

export const winningTagSchema = z.object({
  tag: z.string(),
  currency: currencySchema,
  ads: z.number().int(),
  spendMinor: z.number().int(),
  purchases: z.number().int(),
  roas: ratio,
  cpaMinor: z.number().int().nullable(),
});
export type WinningTagDto = z.infer<typeof winningTagSchema>;

export const winningTagsResponseSchema = z.object({
  data: z.array(winningTagSchema),
});
export type WinningTagsResponse = z.infer<typeof winningTagsResponseSchema>;

export const refreshMetricsResponseSchema = z.object({
  updatedAt: z.iso.datetime(),
});
export type RefreshMetricsResponse = z.infer<
  typeof refreshMetricsResponseSchema
>;
