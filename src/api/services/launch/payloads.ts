import { z } from "zod";
import type { LaunchDraft } from "../../../shared/schemas/launch";
import type { Settings } from "../../../shared/schemas/workspaces";
import { isRecord } from "../../integrations/meta/payload";
import { AppError, unprocessable } from "../../lib/errors";

const TARGETING_FIELDS = [
  "age_min",
  "age_max",
  "genders",
  "geo_locations",
  "excluded_geo_locations",
  "custom_audiences",
  "excluded_custom_audiences",
  "flexible_spec",
  "exclusions",
  "brand_safety_content_filter_levels",
  "publisher_platforms",
  "facebook_positions",
  "instagram_positions",
  "messenger_positions",
  "audience_network_positions",
  "device_platforms",
  "user_os",
  "locales",
] as const;

const CREATIVE_FEATURES = [
  "adapt_to_placement",
  "add_text_overlay",
  "description_automation",
  "enhance_cta",
  "image_animation",
  "image_brightness_and_contrast",
  "image_templates",
  "image_touchups",
  "image_uncrop",
  "inline_comment",
  "media_type_automation",
  "product_extensions",
  "reveal_details_over_time",
  "site_extensions",
  "text_optimizations",
  "video_auto_crop",
] as const;

const BID_AMOUNT_STRATEGIES = new Set(["COST_CAP", "LOWEST_COST_WITH_BID_CAP"]);
const BID_CONSTRAINTS_STRATEGY = "LOWEST_COST_WITH_MIN_ROAS";
const OTHER_PAGE_MESSAGE = "Usa una publicación de otra página";

const launchDefaultsSchema = z.object({
  objective: z.string().default("OUTCOME_SALES"),
  optimizationGoal: z.string().default("OFFSITE_CONVERSIONS"),
  billingEvent: z.string().default("IMPRESSIONS"),
  attributionSpec: z.array(z.record(z.string(), z.unknown())).optional(),
  targeting: z.record(z.string(), z.unknown()).default({}),
});

type Targeting = Record<string, unknown>;

export type PayloadSettings = Pick<
  Settings,
  "maxCampaignBudgetMinor" | "advantageCreativeEnabled" | "launchDefaults"
>;

export type CampaignDraft = Pick<
  LaunchDraft,
  "campaignName" | "bidStrategy" | "dailyBudgetMinor"
>;

export type AdsetDraft = Pick<
  LaunchDraft,
  | "mode"
  | "adsetName"
  | "pixelId"
  | "bidStrategy"
  | "bidAmountMinor"
  | "countries"
  | "optimizationEvent"
> & { campaignId: string };

export interface AdsetReference {
  campaignBidStrategy: string;
  optimizationGoal: string;
  billingEvent: string;
  attributionSpec?: unknown;
  targeting: Targeting;
  customEventType: string;
  bidAmount?: number;
  bidConstraints?: unknown;
}

export interface CreativeItem {
  adName: string;
  pageId: string;
  instagramUserId?: string;
}

export interface CreativeProduct {
  landingUrl: string;
  utm?: string | null;
}

export type CreativeCopy = Pick<
  LaunchDraft["copy"],
  "primaryText" | "headline" | "description" | "cta"
>;

export type CreativeMedia =
  | { kind: "video"; videoId: string; thumbnailUrl: string }
  | { kind: "image"; imageHash: string }
  | { kind: "story"; storyId: string };

export interface AdInput {
  adName: string;
  adsetId: string;
  creativeId: string;
  pixelId: string;
}

const launchDefaults = (settings: PayloadSettings) =>
  launchDefaultsSchema.parse(settings.launchDefaults);

export function buildCampaignPayload(
  draft: CampaignDraft,
  settings: PayloadSettings,
) {
  const budget = draft.dailyBudgetMinor ?? 0;
  if (budget < 1 || budget > settings.maxCampaignBudgetMinor) {
    throw unprocessable("BUDGET_CAP");
  }
  return {
    name: draft.campaignName,
    objective: launchDefaults(settings).objective,
    status: "PAUSED",
    buying_type: "AUCTION",
    special_ad_categories: [],
    bid_strategy: draft.bidStrategy,
    daily_budget: budget,
  };
}

export function cleanTargeting(targeting: Targeting): Targeting {
  const cleaned: Targeting = Object.fromEntries(
    TARGETING_FIELDS.filter((field) => targeting[field] !== undefined).map(
      (field) => [field, targeting[field]],
    ),
  );
  const automation = targeting.targeting_automation;
  if (isRecord(automation) && automation.advantage_audience !== undefined) {
    cleaned.targeting_automation = {
      advantage_audience: automation.advantage_audience,
    };
  }
  return cleaned;
}

function requireReference<T>(value: T | undefined): T {
  if (value === undefined) throw unprocessable("NO_REFERENCE_ADSET");
  return value;
}

function referenceBid(reference: AdsetReference) {
  if (BID_AMOUNT_STRATEGIES.has(reference.campaignBidStrategy)) {
    return { bid_amount: requireReference(reference.bidAmount) };
  }
  if (reference.campaignBidStrategy === BID_CONSTRAINTS_STRATEGY) {
    return { bid_constraints: requireReference(reference.bidConstraints) };
  }
  return {};
}

function newAdsetSource(draft: AdsetDraft, settings: PayloadSettings) {
  const defaults = launchDefaults(settings);
  const targeting = cleanTargeting(defaults.targeting);
  const geo = isRecord(targeting.geo_locations) ? targeting.geo_locations : {};
  return {
    optimizationGoal: defaults.optimizationGoal,
    billingEvent: defaults.billingEvent,
    attributionSpec: defaults.attributionSpec,
    targeting: {
      ...targeting,
      geo_locations: { ...geo, countries: draft.countries },
    },
    customEventType: draft.optimizationEvent,
    bid:
      draft.bidStrategy === "COST_CAP"
        ? { bid_amount: draft.bidAmountMinor }
        : {},
  };
}

function referenceAdsetSource(reference: AdsetReference | undefined) {
  const source = requireReference(reference);
  return {
    ...source,
    targeting: cleanTargeting(source.targeting),
    bid: referenceBid(source),
  };
}

export function buildAdsetPayload(
  draft: AdsetDraft,
  reference: AdsetReference | undefined,
  settings: PayloadSettings,
) {
  const source =
    draft.mode === "new_cbo"
      ? newAdsetSource(draft, settings)
      : referenceAdsetSource(reference);
  return {
    name: draft.adsetName,
    campaign_id: draft.campaignId,
    status: "PAUSED",
    optimization_goal: source.optimizationGoal,
    billing_event: source.billingEvent,
    targeting: source.targeting,
    promoted_object: {
      pixel_id: draft.pixelId,
      custom_event_type: source.customEventType,
    },
    attribution_spec: source.attributionSpec,
    ...source.bid,
  };
}

function enhancementsSpec(settings: PayloadSettings) {
  const enroll_status = settings.advantageCreativeEnabled
    ? "OPT_IN"
    : "OPT_OUT";
  return {
    degrees_of_freedom_spec: {
      creative_features_spec: Object.fromEntries(
        CREATIVE_FEATURES.map((feature) => [feature, { enroll_status }]),
      ),
    },
    contextual_multi_ads: { enroll_status: "OPT_OUT" },
  };
}

function clonedCreative(
  item: CreativeItem,
  storyId: string,
  settings: PayloadSettings,
) {
  if (storyId.split("_")[0] !== item.pageId) {
    throw new AppError(422, "BLOCKERS", { message: OTHER_PAGE_MESSAGE });
  }
  return {
    name: item.adName,
    object_story_id: storyId,
    ...enhancementsSpec(settings),
  };
}

function mediaSpec(
  media: Exclude<CreativeMedia, { kind: "story" }>,
  product: CreativeProduct,
  copy: CreativeCopy,
) {
  const call_to_action = {
    type: copy.cta,
    value: { link: product.landingUrl },
  };
  if (media.kind === "video") {
    return {
      video_data: {
        video_id: media.videoId,
        image_url: media.thumbnailUrl,
        title: copy.headline,
        message: copy.primaryText,
        link_description: copy.description,
        call_to_action,
      },
    };
  }
  return {
    link_data: {
      image_hash: media.imageHash,
      link: product.landingUrl,
      name: copy.headline,
      message: copy.primaryText,
      description: copy.description,
      call_to_action,
    },
  };
}

export function buildCreativePayload(
  item: CreativeItem,
  product: CreativeProduct,
  copy: CreativeCopy,
  media: CreativeMedia,
  settings: PayloadSettings,
) {
  if (media.kind === "story") {
    return clonedCreative(item, media.storyId, settings);
  }
  return {
    object_story_spec: {
      page_id: item.pageId,
      instagram_user_id: item.instagramUserId,
      ...mediaSpec(media, product, copy),
    },
    ...enhancementsSpec(settings),
    url_tags: product.utm?.replace(/^[?&\s]+/, "") || undefined,
  };
}

export function buildAdPayload(input: AdInput) {
  return {
    name: input.adName,
    adset_id: input.adsetId,
    status: "PAUSED",
    creative: { creative_id: input.creativeId },
    tracking_specs: [
      { "action.type": ["offsite_conversion"], fb_pixel: [input.pixelId] },
    ],
  };
}
