import { z } from "zod";
import {
  CREATIVE_AI_STATUSES,
  CREATIVE_KINDS,
  CREATIVE_STATUSES,
} from "../constants";
import { paginatedSchema, paginationQuerySchema } from "./common";

export const TAG_FORMATS = [
  "ugc",
  "demo",
  "testimonio",
  "estatico",
  "otro",
] as const;

export const CREATIVE_SORTS = ["recent", "most_used"] as const;

export type CreativeKind = (typeof CREATIVE_KINDS)[number];
export type CreativeStatus = (typeof CREATIVE_STATUSES)[number];
export type CreativeAiStatus = (typeof CREATIVE_AI_STATUSES)[number];
export type TagFormat = (typeof TAG_FORMATS)[number];

const NAME_MAX = 255;
const TAG_MAX = 120;
const IDS_MAX = 100;
const Q_MAX = 120;

const commaList = <Item extends z.ZodType<unknown, string>>(
  item: Item,
  max: number,
) =>
  z
    .string()
    .transform((raw) => [...new Set(raw.split(","))])
    .pipe(z.array(item).min(1).max(max));

export const listCreativesQuerySchema = paginationQuerySchema.extend({
  ids: commaList(z.string().min(1).max(64), IDS_MAX).optional(),
  status: commaList(
    z.enum(CREATIVE_STATUSES),
    CREATIVE_STATUSES.length,
  ).optional(),
  kind: z.enum(CREATIVE_KINDS).optional(),
  q: z.string().trim().min(1).max(Q_MAX).optional(),
  tag: z.string().trim().min(1).max(TAG_MAX).optional(),
  adAccountAssetId: z.string().min(1).max(64).optional(),
  sort: z.enum(CREATIVE_SORTS).default("recent"),
});
export type ListCreativesQuery = z.infer<typeof listCreativesQuerySchema>;

const tagText = z.string().trim().min(1).max(TAG_MAX).nullable();

export const creativeTagsSchema = z.object({
  hook: tagText,
  angle: tagText,
  format: z.enum(TAG_FORMATS).nullable(),
  language: z
    .string()
    .regex(/^[a-z]{2}$/)
    .nullable(),
  onScreenText: z.boolean().nullable(),
});
export type CreativeTags = z.infer<typeof creativeTagsSchema>;

export const creativePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX),
    tags: creativeTagsSchema,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0);
export type CreativePatch = z.infer<typeof creativePatchSchema>;

export const archiveCreativeRequestSchema = z.object({
  archived: z.boolean(),
});

export const creativeSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(CREATIVE_KINDS),
  status: z.enum(CREATIVE_STATUSES),
  adAccountAssetId: z.string(),
  thumbnailUrl: z.string().nullable(),
  formatWarning: z.literal("horizontal").nullable(),
  tags: creativeTagsSchema,
  aiStatus: z.enum(CREATIVE_AI_STATUSES),
  usedInLaunches: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type CreativeDto = z.infer<typeof creativeSchema>;

export const creativesPageSchema = paginatedSchema(creativeSchema);

export const creativeResponseSchema = z.object({ creative: creativeSchema });
