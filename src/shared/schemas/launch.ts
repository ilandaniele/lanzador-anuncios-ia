import { z } from "zod";
import {
  CTAS,
  LAUNCH_ITEM_SOURCES,
  LAUNCH_ITEM_STATUSES,
  LAUNCH_MODES,
  LAUNCH_SOURCES,
  LAUNCH_STATUSES,
} from "../constants";
import {
  currencySchema,
  paginatedSchema,
  paginationQuerySchema,
} from "./common";

const ID_MAX = 64;
const NAME_MAX = 120;
const PRIMARY_TEXT_MAX = 2000;
const HEADLINE_MAX = 255;
const DESCRIPTION_MAX = 255;
const HINT_MAX = 255;
const COUNTRIES_MAX = 50;
const ITEMS_MAX = 100;
const PHASES = [
  "preflight",
  "campaign",
  "adset",
  "items",
  "verify",
  "activate",
] as const;
const MEDIA_KINDS = ["video", "image"] as const;
const BID_STRATEGIES = ["LOWEST_COST_WITHOUT_CAP", "COST_CAP"] as const;

export type LaunchStatus = (typeof LAUNCH_STATUSES)[number];
export type LaunchSource = (typeof LAUNCH_SOURCES)[number];
export type LaunchMode = (typeof LAUNCH_MODES)[number];
export type LaunchPhase = (typeof PHASES)[number];
export type LaunchItemSource = (typeof LAUNCH_ITEM_SOURCES)[number];
export type LaunchItemStatus = (typeof LAUNCH_ITEM_STATUSES)[number];

const text = (max: number) => z.string().trim().min(1).max(max);
const id = text(ID_MAX);

const copyFields = {
  copyId: id.optional(),
  primaryText: text(PRIMARY_TEXT_MAX),
  headline: text(HEADLINE_MAX),
  description: text(DESCRIPTION_MAX).optional(),
  cta: z.enum(CTAS),
};

const itemSchema = z.object({
  source: z.enum(LAUNCH_ITEM_SOURCES),
  creativeId: id.optional(),
  cloneAdId: id.optional(),
  cloneStoryId: id.optional(),
  adName: text(NAME_MAX),
  copyId: id.optional(),
  mediaKind: z.enum(MEDIA_KINDS).optional(),
});

const draftFields = {
  adAccountAssetId: id,
  pixelId: id,
  pageId: id,
  instagramUserId: id.optional(),
  mode: z.enum(LAUNCH_MODES),
  existingCampaignId: id.optional(),
  productId: id,
  copy: z.object(copyFields),
  items: z.array(itemSchema).min(1).max(ITEMS_MAX),
  dailyBudgetMinor: z.int().positive().optional(),
  bidStrategy: z.enum(BID_STRATEGIES),
  bidAmountMinor: z.int().positive().optional(),
  countries: z
    .array(z.string().regex(/^[A-Z]{2}$/))
    .min(1)
    .max(COUNTRIES_MAX),
  optimizationEvent: z.literal("PURCHASE"),
  campaignName: text(NAME_MAX),
  adsetName: text(NAME_MAX),
  driveFolderHint: text(HINT_MAX).optional(),
  startAt: z.iso.datetime().optional(),
};

type DraftItems = { items?: { mediaKind?: (typeof MEDIA_KINDS)[number] }[] };

const hasSingleMediaKind = ({ items = [] }: DraftItems) =>
  new Set(items.flatMap(({ mediaKind }) => mediaKind ?? [])).size <= 1;

const MIXED_MEDIA = { message: "MIXED_MEDIA", path: ["items"] };

export const launchDraftSchema = z
  .object(draftFields)
  .refine(hasSingleMediaKind, MIXED_MEDIA);
export type LaunchDraft = z.infer<typeof launchDraftSchema>;

export const partialLaunchDraftSchema = z
  .object({
    ...draftFields,
    copy: z.object(copyFields).partial(),
    items: z.array(itemSchema).max(ITEMS_MAX),
  })
  .partial()
  .refine(hasSingleMediaKind, MIXED_MEDIA);
export type PartialLaunchDraft = z.infer<typeof partialLaunchDraftSchema>;

export const launchDraftRequestSchema = z.object({
  draft: partialLaunchDraftSchema,
});

export const createLaunchRequestSchema = launchDraftRequestSchema.extend({
  source: z.enum(["manual", "top_ads"]).optional(),
});

export const launchStartRequestSchema = z.object({
  confirm: z.literal(true),
  planHash: z.string().min(1).max(128),
});
export type LaunchStartRequest = z.infer<typeof launchStartRequestSchema>;

export const listLaunchesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(LAUNCH_STATUSES).optional(),
});
export type ListLaunchesQuery = z.infer<typeof listLaunchesQuerySchema>;

const reportLine = z.object({ code: z.string(), text: z.string() });

export const launchCheckSchema = z.object({
  ok: z.boolean(),
  code: z.string(),
  text: z.string(),
});
export type LaunchCheck = z.infer<typeof launchCheckSchema>;

export const launchPlanSchema = z.object({
  campaign: z
    .object({
      name: z.string(),
      dailyBudgetMinor: z.number(),
      bidStrategy: z.enum(BID_STRATEGIES),
    })
    .optional(),
  adset: z.object({
    name: z.string(),
    countries: z.array(z.string()),
    optimizationEvent: z.literal("PURCHASE"),
  }),
  ads: z.array(
    z.object({
      position: z.number(),
      adName: z.string(),
      mediaKind: z.enum(MEDIA_KINDS),
      link: z.string(),
      pageId: z.string(),
      instagramUserId: z.string().nullable(),
    }),
  ),
  warnings: z.array(reportLine),
  blockers: z.array(reportLine),
  planHash: z.string(),
});
export type LaunchPlan = z.infer<typeof launchPlanSchema>;

export const launchProgressSchema = z.object({
  status: z.enum(LAUNCH_STATUSES),
  phase: z.enum(PHASES).nullable(),
  counts: z.object({
    total: z.number(),
    done: z.number(),
    failed: z.number(),
  }),
  items: z.array(
    z.object({
      id: z.string(),
      position: z.number(),
      status: z.enum(LAUNCH_ITEM_STATUSES),
      adName: z.string(),
      metaAdId: z.string().optional(),
      error: z.string().optional(),
    }),
  ),
  checks: z.array(launchCheckSchema).optional(),
  updatedAt: z.iso.datetime(),
  nextPollMs: z.number().nullable(),
});
export type LaunchProgress = z.infer<typeof launchProgressSchema>;

export const launchListItemSchema = z.object({
  id: z.string(),
  status: z.enum(LAUNCH_STATUSES),
  source: z.enum(LAUNCH_SOURCES),
  productName: z.string().nullable(),
  adAccountName: z.string().nullable(),
  campaignName: z.string().nullable(),
  itemsTotal: z.number(),
  itemsDone: z.number(),
  itemsFailed: z.number(),
  metaCampaignUrl: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type LaunchListItemDto = z.infer<typeof launchListItemSchema>;

export const launchesPageSchema = paginatedSchema(launchListItemSchema);

export const launchSchema = z.object({
  id: z.string(),
  status: z.enum(LAUNCH_STATUSES),
  phase: z.enum(PHASES).nullable(),
  source: z.enum(LAUNCH_SOURCES),
  mode: z.enum(LAUNCH_MODES).nullable(),
  adAccountAssetId: z.string().nullable(),
  currency: currencySchema.nullable(),
  productId: z.string().nullable(),
  draft: partialLaunchDraftSchema,
  planHash: z.string().nullable(),
  dailyBudgetMinor: z.number().nullable(),
  startAt: z.iso.datetime().nullable(),
  metaCampaignUrl: z.string().nullable(),
  itemsTotal: z.number(),
  itemsDone: z.number(),
  itemsFailed: z.number(),
  checksOk: z.boolean().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  activatedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});
export type LaunchDto = z.infer<typeof launchSchema>;

export const launchResponseSchema = z.object({ launch: launchSchema });

export const launchItemSchema = z.object({
  id: z.string(),
  position: z.number(),
  status: z.enum(LAUNCH_ITEM_STATUSES),
  source: z.enum(LAUNCH_ITEM_SOURCES),
  creativeId: z.string().nullable(),
  adName: z.string(),
  metaAdId: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});
export type LaunchItemDto = z.infer<typeof launchItemSchema>;

export const launchDetailResponseSchema = z.object({
  launch: launchSchema,
  items: z.array(launchItemSchema),
  checks: z.array(launchCheckSchema).nullable(),
  plan: launchPlanSchema.nullable(),
});
export type LaunchDetailResponse = z.infer<typeof launchDetailResponseSchema>;

export const launchRetryRequestSchema = launchStartRequestSchema.pick({
  confirm: true,
});

export const launchActivateRequestSchema = launchRetryRequestSchema.extend({
  startAt: z.iso.datetime().optional(),
});
export type LaunchActivateRequest = z.infer<typeof launchActivateRequestSchema>;

export const launchProgressQuerySchema = z.object({
  since: z.iso.datetime().optional(),
});
export type LaunchProgressQuery = z.infer<typeof launchProgressQuerySchema>;
