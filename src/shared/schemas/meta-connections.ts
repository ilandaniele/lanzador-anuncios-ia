import { z } from "zod";
import { ASSET_KINDS, CONNECTION_STATUSES } from "../constants";
import { paginatedSchema, paginationQuerySchema } from "./common";

const MAX_ASSET_CHANGES = 100;

export const connectionSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  businessName: z.string().nullable(),
  status: z.enum(CONNECTION_STATUSES),
  scopes: z.array(z.string()),
  connectedBy: z.string().nullable(),
  connectedAt: z.iso.datetime(),
  lastErrorCode: z.number().nullable(),
  tokenExpiresAt: z.iso.datetime().nullable(),
  creativeCount: z.number(),
});
export type ConnectionDto = z.infer<typeof connectionSchema>;

export const connectionsResponseSchema = z.object({
  data: z.array(connectionSchema),
});

export const assetSchema = z.object({
  id: z.string(),
  kind: z.enum(ASSET_KINDS),
  metaId: z.string(),
  name: z.string(),
  parentMetaId: z.string().nullable(),
  currency: z.string().nullable(),
  enabled: z.boolean(),
  health: z.object({
    accountStatus: z.number().nullable(),
    disableReason: z.number().nullable(),
    fundingOk: z.boolean().nullable(),
    spendCapPct: z.number().nullable(),
    checkedAt: z.iso.datetime().nullable(),
  }),
});
export type AssetDto = z.infer<typeof assetSchema>;

export const assetsListResponseSchema = paginatedSchema(assetSchema);
export const assetsResponseSchema = z.object({ data: z.array(assetSchema) });

export const listAssetsQuerySchema = paginationQuerySchema.extend({
  kind: z.enum(ASSET_KINDS).optional(),
  enabled: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;

export const patchAssetsRequestSchema = z.object({
  changes: z
    .array(z.object({ id: z.string().min(1), enabled: z.boolean() }))
    .min(1)
    .max(MAX_ASSET_CHANGES)
    .refine(
      (changes) => new Set(changes.map(({ id }) => id)).size === changes.length,
    ),
});
export type PatchAssetsRequest = z.infer<typeof patchAssetsRequestSchema>;

export const disconnectRequestSchema = z.object({ confirm: z.literal(true) });
