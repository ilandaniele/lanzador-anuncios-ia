import { z } from "zod";
import { RANGE_PRESETS } from "../insight-range";

export const CAMPAIGN_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "WITH_ISSUES",
  "IN_PROCESS",
] as const;

export const metaIdSchema = z.string().regex(/^\d{1,32}$/);

export const listCampaignsQuerySchema = z.object({
  status: z
    .string()
    .default(CAMPAIGN_STATUSES.join(","))
    .transform((raw) => raw.split(","))
    .pipe(z.array(z.enum(CAMPAIGN_STATUSES)).min(1))
    .transform((statuses) => [...new Set(statuses)].sort()),
});
export type ListCampaignsQuery = z.infer<typeof listCampaignsQuerySchema>;

export const campaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  effectiveStatus: z.string(),
  dailyBudgetMinor: z.number().nullable(),
  objective: z.string().nullable(),
  bidStrategy: z.string().nullable(),
  isCbo: z.boolean(),
});
export type CampaignDto = z.infer<typeof campaignSchema>;

export const campaignsResponseSchema = z.object({
  data: z.array(campaignSchema),
  truncated: z.boolean(),
});
export type CampaignsResponse = z.infer<typeof campaignsResponseSchema>;

export const campaignReferenceQuerySchema = z.object({
  adAccountAssetId: z.string().min(1),
});

export const campaignReferenceSchema = z.object({
  adsetName: z.string(),
  optimizationGoal: z.string().nullable(),
  customEventType: z.string().nullable(),
  pixelId: z.string().nullable(),
  bidStrategy: z.string().nullable(),
  bidAmountMinor: z.number().nullable(),
  countries: z.array(z.string()),
  dailyBudgetMinor: z.number(),
  nextAdsetNumber: z.number().int(),
});
export type CampaignReferenceDto = z.infer<typeof campaignReferenceSchema>;

const adAccountAssetIdField = z.string().min(1);

const customRangeQuerySchema = z
  .object({
    adAccountAssetId: adAccountAssetIdField,
    range: z.literal("custom"),
    from: z.string(),
    to: z.string(),
  })
  .transform(({ adAccountAssetId, from, to }) => ({
    adAccountAssetId,
    range: { from, to },
  }));

const presetRangeQuerySchema = z
  .object({
    adAccountAssetId: adAccountAssetIdField,
    range: z.enum(RANGE_PRESETS).default("last_7d"),
  })
  .transform(({ adAccountAssetId, range }) => ({
    adAccountAssetId,
    range: { preset: range },
  }));

export const campaignAdsQuerySchema = z.union([
  customRangeQuerySchema,
  presetRangeQuerySchema,
]);

export const campaignAdSchema = z.object({
  adId: z.string(),
  name: z.string(),
  storyId: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  effectiveStatus: z.string(),
  spendMinor: z.number(),
  purchases: z.number(),
  roas: z.number().nullable(),
});
export type CampaignAdDto = z.infer<typeof campaignAdSchema>;

export const campaignAdsResponseSchema = z.object({
  data: z.array(campaignAdSchema),
  truncated: z.boolean(),
});
export type CampaignAdsResponse = z.infer<typeof campaignAdsResponseSchema>;

export const adPreviewQuerySchema = z.object({
  adAccountAssetId: adAccountAssetIdField,
});

export const adPreviewSchema = z.object({ iframeSrc: z.string() });
export type AdPreviewDto = z.infer<typeof adPreviewSchema>;
