import { z } from "zod";
import { paginatedSchema } from "./common";

const adAccountAssetIdField = z.string().min(1);

export const WRITABLE_STATUSES = ["ACTIVE", "PAUSED"] as const;
export const META_OBJECT_LEVELS = ["campaign", "adset", "ad"] as const;

export const objectStatusRequestSchema = z.object({
  adAccountAssetId: adAccountAssetIdField,
  level: z.enum(META_OBJECT_LEVELS),
  status: z.string().min(1).max(32),
  confirm: z.literal(true),
});
export type ObjectStatusRequest = z.infer<typeof objectStatusRequestSchema>;

export const objectStatusResponseSchema = z.object({
  status: z.enum(WRITABLE_STATUSES),
});
export type ObjectStatusResponse = z.infer<typeof objectStatusResponseSchema>;

export const scaleCampaignRequestSchema = z.object({
  adAccountAssetId: adAccountAssetIdField,
  percent: z.int().positive(),
  expectedCurrentBudgetMinor: z.int().positive(),
  confirm: z.literal(true),
});
export type ScaleCampaignRequest = z.infer<typeof scaleCampaignRequestSchema>;

export const scaleCampaignResponseSchema = z.object({
  previousBudgetMinor: z.number(),
  newBudgetMinor: z.number(),
});
export type ScaleCampaignResponse = z.infer<typeof scaleCampaignResponseSchema>;

export const protectCampaignRequestSchema = z.object({
  adAccountAssetId: adAccountAssetIdField,
});
export type ProtectCampaignRequest = z.infer<
  typeof protectCampaignRequestSchema
>;

export const protectedCampaignSchema = z.object({
  campaignId: z.string(),
  adAccountId: z.string(),
  protectedBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type ProtectedCampaignDto = z.infer<typeof protectedCampaignSchema>;

export const protectedCampaignsPageSchema = paginatedSchema(
  protectedCampaignSchema,
);
