import { z } from "zod";
import type { AssetKind } from "../../../shared/constants";
import {
  type DateWindow,
  type InsightRange,
  resolveWindow,
} from "../../../shared/insight-range";
import {
  cpaMinor,
  cpmMinor,
  ctr,
  roas,
  toMinorUnits,
} from "../../../shared/metrics";
import type { Graph } from "./client";
import { invalidPayloadError } from "./errors";
import type { QueryValues } from "./payload";

const PAGE_SIZE = 100;
const MAX_ITEMS_PER_EDGE = 500;
const MAX_INSIGHT_ROWS = 1000;
const BUSINESS_SCOPE = "business_management";

const AD_ACCOUNT_FIELDS =
  "id,name,account_id,account_status,currency,timezone_name,business{id,name},adspixels{id,name,last_fired_time}";
const PAGE_FIELDS = "id,name,instagram_business_account{id,username}";

const userSchema = z.object({ id: z.string(), name: z.string() });

const adAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  account_status: z.number().optional(),
  currency: z.string().optional(),
  timezone_name: z.string().optional(),
  business: z.object({ id: z.string(), name: z.string() }).optional(),
  adspixels: z
    .object({ data: z.array(z.object({ id: z.string(), name: z.string() })) })
    .optional(),
});

const pageSchema = z.object({
  id: z.string(),
  name: z.string(),
  instagram_business_account: z
    .object({ id: z.string(), username: z.string().optional() })
    .optional(),
});

const edgeSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    paging: z
      .object({
        cursors: z.object({ after: z.string().optional() }).optional(),
      })
      .optional(),
  });

export interface GranularScope {
  scope: string;
  target_ids?: string[];
}

export interface DiscoveredAsset {
  kind: AssetKind;
  metaId: string;
  name: string;
  parentMetaId: string | null;
  currency: string | null;
  timezoneName: string | null;
  accountStatus: number | null;
}

export interface DiscoveredAssets {
  user: z.infer<typeof userSchema>;
  businessId: string | null;
  businessName: string | null;
  assets: DiscoveredAsset[];
}

function parse<S extends z.ZodType>(schema: S, payload: unknown): z.infer<S> {
  const result = schema.safeParse(payload);
  if (!result.success) throw invalidPayloadError();
  return result.data;
}

interface EdgeOptions {
  extra?: QueryValues;
  maxItems?: number;
}

async function fetchEdge<S extends z.ZodType>(
  graph: Graph,
  path: string,
  fields: string,
  item: S,
  { extra = {}, maxItems = MAX_ITEMS_PER_EDGE }: EdgeOptions = {},
): Promise<z.infer<S>[]> {
  const items: z.infer<S>[] = [];
  let after: string | undefined;
  while (items.length < maxItems) {
    const page = parse(
      edgeSchema(item),
      await graph.get<unknown>(path, {
        ...extra,
        fields,
        limit: PAGE_SIZE,
        ...(after ? { after } : {}),
      }),
    );
    items.push(...page.data);
    after = page.paging?.cursors?.after;
    if (!after || page.data.length < PAGE_SIZE) break;
  }
  return items.slice(0, maxItems);
}

async function fetchPages(graph: Graph) {
  const pages = await fetchEdge(graph, "me/accounts", PAGE_FIELDS, pageSchema);
  if (pages.length > 0) return pages;
  return fetchEdge(graph, "me/assigned_pages", PAGE_FIELDS, pageSchema);
}

type AdAccount = z.infer<typeof adAccountSchema>;
type Page = z.infer<typeof pageSchema>;

const emptyAsset = {
  parentMetaId: null,
  currency: null,
  timezoneName: null,
  accountStatus: null,
};

const adAccountAssets = (account: AdAccount): DiscoveredAsset[] => [
  {
    ...emptyAsset,
    kind: "ad_account",
    metaId: account.id,
    name: account.name,
    currency: account.currency ?? null,
    timezoneName: account.timezone_name ?? null,
    accountStatus: account.account_status ?? null,
  },
  ...(account.adspixels?.data ?? []).map((pixel) => ({
    ...emptyAsset,
    kind: "pixel" as const,
    metaId: pixel.id,
    name: pixel.name,
    parentMetaId: account.id,
  })),
];

const pageAssets = (page: Page): DiscoveredAsset[] => [
  { ...emptyAsset, kind: "page", metaId: page.id, name: page.name },
  ...(page.instagram_business_account
    ? [
        {
          ...emptyAsset,
          kind: "instagram" as const,
          metaId: page.instagram_business_account.id,
          name:
            page.instagram_business_account.username ??
            page.instagram_business_account.id,
          parentMetaId: page.id,
        },
      ]
    : []),
];

function uniqueAssets(assets: DiscoveredAsset[]): DiscoveredAsset[] {
  const byKey = new Map(
    assets.map((asset) => [`${asset.kind}:${asset.metaId}`, asset]),
  );
  return [...byKey.values()];
}

export function resolveBusiness(
  accounts: AdAccount[],
  granularScopes: GranularScope[],
) {
  const scoped = granularScopes.find(({ scope }) => scope === BUSINESS_SCOPE)
    ?.target_ids?.[0];
  const businesses = accounts.flatMap(({ business }) =>
    business ? [business] : [],
  );
  const business = scoped
    ? businesses.find(({ id }) => id === scoped)
    : businesses[0];
  return {
    businessId: scoped ?? business?.id ?? null,
    businessName: business?.name ?? null,
  };
}

export async function discoverAssets(
  graph: Graph,
  granularScopes: GranularScope[] = [],
): Promise<DiscoveredAssets> {
  const user = parse(
    userSchema,
    await graph.get<unknown>("me", { fields: "id,name" }),
  );
  const accounts = await fetchEdge(
    graph,
    "me/adaccounts",
    AD_ACCOUNT_FIELDS,
    adAccountSchema,
  );
  const pages = await fetchPages(graph);
  return {
    user,
    ...resolveBusiness(accounts, granularScopes),
    assets: uniqueAssets([
      ...accounts.flatMap(adAccountAssets),
      ...pages.flatMap(pageAssets),
    ]),
  };
}

const DECIMAL = /^-?\d+(\.\d+)?$/;
const INTEGER = /^-?\d+$/;
const PURCHASE_ACTION_TYPES = [
  "omni_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
];
const INSIGHT_METRIC_FIELDS =
  "spend,impressions,clicks,actions,action_values,date_start,date_stop";
const INSIGHT_FIELDS = {
  account: INSIGHT_METRIC_FIELDS,
  campaign: `campaign_id,campaign_name,${INSIGHT_METRIC_FIELDS}`,
  adset: `adset_id,adset_name,campaign_id,${INSIGHT_METRIC_FIELDS}`,
  ad: `ad_id,ad_name,adset_id,campaign_id,${INSIGHT_METRIC_FIELDS}`,
} as const;
const ENTITY_KEYS = {
  campaign: { id: "campaign_id", name: "campaign_name" },
  adset: { id: "adset_id", name: "adset_name" },
  ad: { id: "ad_id", name: "ad_name" },
} as const;
const ISSUE_STATUSES = ["WITH_ISSUES", "DISAPPROVED"];
const ACCOUNT_HEALTH_FIELDS =
  "id,account_status,disable_reason,currency,spend_cap,amount_spent,balance,is_prepay_account,funding_source_details{id,type,display_string}";
const ISSUE_AD_FIELDS =
  "id,name,effective_status,campaign_id,adset_id,issues_info";

export type InsightLevel = keyof typeof INSIGHT_FIELDS;

const decimalSchema = z.string().regex(DECIMAL);
const countSchema = z.string().regex(INTEGER).transform(Number);
const minorSchema = z.string().regex(INTEGER).transform(Number);

const actionSchema = z.object({
  action_type: z.string(),
  value: decimalSchema,
});

const insightRowSchema = z.object({
  campaign_id: z.string().optional(),
  campaign_name: z.string().optional(),
  adset_id: z.string().optional(),
  adset_name: z.string().optional(),
  ad_id: z.string().optional(),
  ad_name: z.string().optional(),
  date_start: z.string(),
  spend: decimalSchema.default("0"),
  impressions: countSchema.default(0),
  clicks: countSchema.default(0),
  actions: z.array(actionSchema).default([]),
  action_values: z.array(actionSchema).default([]),
});

const accountHealthSchema = z.object({
  id: z.string(),
  account_status: z.number(),
  disable_reason: z.number().optional(),
  currency: z.string(),
  spend_cap: minorSchema.optional(),
  amount_spent: minorSchema.optional(),
  balance: minorSchema.optional(),
  is_prepay_account: z.boolean().optional(),
  funding_source_details: z
    .object({
      id: z.string(),
      type: z.number().optional(),
      display_string: z.string().optional(),
    })
    .optional(),
});

const issueAdSchema = z.object({
  id: z.string(),
  name: z.string(),
  effective_status: z.string(),
  campaign_id: z.string().optional(),
  adset_id: z.string().optional(),
  issues_info: z
    .array(
      z.object({
        level: z.string().optional(),
        error_code: z.number().optional(),
        error_summary: z.string().optional(),
        error_message: z.string().optional(),
        error_type: z.string().optional(),
      }),
    )
    .default([]),
});

type InsightRowPayload = z.infer<typeof insightRowSchema>;
type InsightAction = z.infer<typeof actionSchema>;

export interface InsightsQuery {
  actId: string;
  level: InsightLevel;
  range: InsightRange;
  currency: string;
  timezone: string;
  daily?: boolean;
}

export interface InsightRow {
  level: InsightLevel;
  id: string;
  name: string | null;
  campaignId: string | null;
  adsetId: string | null;
  date: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
  purchases: number;
  purchaseValueMinor: number;
  roas: number | null;
  cpaMinor: number | null;
  ctr: number | null;
  cpmMinor: number | null;
}

export interface Insights {
  window: DateWindow;
  rows: InsightRow[];
}

export interface AccountHealth {
  accountStatus: number;
  disableReason: number | null;
  currency: string;
  spendCapMinor: number | null;
  amountSpentMinor: number | null;
  balanceMinor: number | null;
  isPrepay: boolean;
  fundingSource: {
    id: string;
    type: number | null;
    label: string | null;
  } | null;
}

export interface AdIssue {
  level: string | null;
  code: number | null;
  summary: string | null;
  message: string | null;
  type: string | null;
}

export interface AdWithIssues {
  adId: string;
  name: string;
  effectiveStatus: string;
  campaignId: string | null;
  adsetId: string | null;
  issues: AdIssue[];
}

function purchaseAction(actions: InsightAction[]): InsightAction | undefined {
  return PURCHASE_ACTION_TYPES.map((type) =>
    actions.find(({ action_type }) => action_type === type),
  ).find(Boolean);
}

function insightEntity(
  query: InsightsQuery,
  row: InsightRowPayload,
): { id: string; name: string | null } {
  if (query.level === "account") return { id: query.actId, name: null };
  const keys = ENTITY_KEYS[query.level];
  const id = row[keys.id];
  if (!id) throw invalidPayloadError();
  return { id, name: row[keys.name] ?? null };
}

function toInsightRow(
  query: InsightsQuery,
  row: InsightRowPayload,
): InsightRow {
  const spendMinor = toMinorUnits(row.spend, query.currency);
  const purchases = Number(purchaseAction(row.actions)?.value ?? 0);
  const purchaseValueMinor = toMinorUnits(
    purchaseAction(row.action_values)?.value ?? "0",
    query.currency,
  );
  return {
    level: query.level,
    ...insightEntity(query, row),
    campaignId: row.campaign_id ?? null,
    adsetId: row.adset_id ?? null,
    date: row.date_start,
    spendMinor,
    impressions: row.impressions,
    clicks: row.clicks,
    purchases,
    purchaseValueMinor,
    roas: roas(purchaseValueMinor, spendMinor),
    cpaMinor: cpaMinor(spendMinor, purchases),
    ctr: ctr(row.clicks, row.impressions),
    cpmMinor: cpmMinor(spendMinor, row.impressions),
  };
}

export async function readInsights(
  graph: Graph,
  query: InsightsQuery,
  now: Date = new Date(),
): Promise<Insights> {
  const window = resolveWindow(query.range, query.timezone, now);
  const rows = await fetchEdge(
    graph,
    `${query.actId}/insights`,
    INSIGHT_FIELDS[query.level],
    insightRowSchema,
    {
      extra: {
        level: query.level,
        time_range: JSON.stringify(window),
        ...(query.daily ? { time_increment: 1 } : {}),
      },
      maxItems: MAX_INSIGHT_ROWS,
    },
  );
  return { window, rows: rows.map((row) => toInsightRow(query, row)) };
}

export async function readAccountHealth(
  graph: Graph,
  actId: string,
): Promise<AccountHealth> {
  const account = parse(
    accountHealthSchema,
    await graph.get<unknown>(actId, { fields: ACCOUNT_HEALTH_FIELDS }),
  );
  const funding = account.funding_source_details;
  return {
    accountStatus: account.account_status,
    disableReason: account.disable_reason ?? null,
    currency: account.currency,
    spendCapMinor: account.spend_cap || null,
    amountSpentMinor: account.amount_spent ?? null,
    balanceMinor: account.balance ?? null,
    isPrepay: account.is_prepay_account ?? false,
    fundingSource: funding
      ? {
          id: funding.id,
          type: funding.type ?? null,
          label: funding.display_string ?? null,
        }
      : null,
  };
}

export async function readIssues(
  graph: Graph,
  actId: string,
): Promise<AdWithIssues[]> {
  const ads = await fetchEdge(
    graph,
    `${actId}/ads`,
    ISSUE_AD_FIELDS,
    issueAdSchema,
    {
      extra: {
        filtering: JSON.stringify([
          { field: "effective_status", operator: "IN", value: ISSUE_STATUSES },
        ]),
      },
    },
  );
  return ads
    .filter((ad) => ad.issues_info.length > 0)
    .map((ad) => ({
      adId: ad.id,
      name: ad.name,
      effectiveStatus: ad.effective_status,
      campaignId: ad.campaign_id ?? null,
      adsetId: ad.adset_id ?? null,
      issues: ad.issues_info.map((issue) => ({
        level: issue.level ?? null,
        code: issue.error_code ?? null,
        summary: issue.error_summary ?? null,
        message: issue.error_message ?? null,
        type: issue.error_type ?? null,
      })),
    }));
}

const MAX_CAMPAIGNS = 300;
const CAMPAIGN_FIELDS =
  "id,name,effective_status,daily_budget,objective,bid_strategy";
const REFERENCE_ADSET_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "CAMPAIGN_PAUSED",
  "WITH_ISSUES",
  "IN_PROCESS",
];
const REFERENCE_FIELDS = `account_id,daily_budget,bid_strategy,adsets.limit(${MAX_ITEMS_PER_EDGE}){id,name,effective_status,optimization_goal,billing_event,bid_amount,bid_constraints,attribution_spec,promoted_object,targeting}`;

const metaCampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  effective_status: z.string(),
  daily_budget: minorSchema.optional(),
  objective: z.string().optional(),
  bid_strategy: z.string().optional(),
});

const referenceAdsetSchema = z.object({
  id: z.string(),
  name: z.string(),
  effective_status: z.string(),
  optimization_goal: z.string().optional(),
  billing_event: z.string().optional(),
  bid_amount: z.number().int().optional(),
  bid_constraints: z.unknown().optional(),
  attribution_spec: z.unknown().optional(),
  promoted_object: z
    .object({
      pixel_id: z.string().optional(),
      custom_event_type: z.string().optional(),
    })
    .optional(),
  targeting: z
    .looseObject({
      geo_locations: z
        .object({ countries: z.array(z.string()).optional() })
        .optional(),
    })
    .optional(),
});

const campaignReferenceSchema = z.object({
  account_id: z.string(),
  daily_budget: minorSchema.optional(),
  bid_strategy: z.string().optional(),
  adsets: z.object({ data: z.array(referenceAdsetSchema) }).optional(),
});

type ReferenceAdsetPayload = z.infer<typeof referenceAdsetSchema>;

export interface MetaCampaign {
  id: string;
  name: string;
  effectiveStatus: string;
  dailyBudgetMinor: number | null;
  objective: string | null;
  bidStrategy: string | null;
}

export interface CampaignList {
  campaigns: MetaCampaign[];
  truncated: boolean;
}

export interface ReferenceAdset {
  name: string;
  optimizationGoal: string | null;
  billingEvent: string | null;
  customEventType: string | null;
  pixelId: string | null;
  bidAmountMinor: number | null;
  bidConstraints: unknown;
  attributionSpec: unknown;
  targeting: Record<string, unknown> | null;
  countries: string[];
}

export interface CampaignReference {
  accountId: string;
  dailyBudgetMinor: number | null;
  bidStrategy: string | null;
  adsets: ReferenceAdset[];
}

export async function listCampaigns(
  graph: Graph,
  actId: string,
  statuses: readonly string[],
): Promise<CampaignList> {
  const campaigns = await fetchEdge(
    graph,
    `${actId}/campaigns`,
    CAMPAIGN_FIELDS,
    metaCampaignSchema,
    {
      extra: {
        filtering: JSON.stringify([
          { field: "effective_status", operator: "IN", value: statuses },
        ]),
      },
      maxItems: MAX_CAMPAIGNS + 1,
    },
  );
  return {
    campaigns: campaigns.slice(0, MAX_CAMPAIGNS).map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      effectiveStatus: campaign.effective_status,
      dailyBudgetMinor: campaign.daily_budget ?? null,
      objective: campaign.objective ?? null,
      bidStrategy: campaign.bid_strategy ?? null,
    })),
    truncated: campaigns.length > MAX_CAMPAIGNS,
  };
}

const newestIdFirst = (a: { id: string }, b: { id: string }) =>
  b.id.length - a.id.length || b.id.localeCompare(a.id);

const toReferenceAdset = (adset: ReferenceAdsetPayload): ReferenceAdset => ({
  name: adset.name,
  optimizationGoal: adset.optimization_goal ?? null,
  billingEvent: adset.billing_event ?? null,
  customEventType: adset.promoted_object?.custom_event_type ?? null,
  pixelId: adset.promoted_object?.pixel_id ?? null,
  bidAmountMinor: adset.bid_amount ?? null,
  bidConstraints: adset.bid_constraints,
  attributionSpec: adset.attribution_spec,
  targeting: adset.targeting ?? null,
  countries: adset.targeting?.geo_locations?.countries ?? [],
});

export async function getCampaignReference(
  graph: Graph,
  campaignId: string,
): Promise<CampaignReference> {
  const campaign = parse(
    campaignReferenceSchema,
    await graph.get<unknown>(campaignId, { fields: REFERENCE_FIELDS }),
  );
  return {
    accountId: campaign.account_id,
    dailyBudgetMinor: campaign.daily_budget ?? null,
    bidStrategy: campaign.bid_strategy ?? null,
    adsets: (campaign.adsets?.data ?? [])
      .filter(({ effective_status }) =>
        REFERENCE_ADSET_STATUSES.includes(effective_status),
      )
      .sort(newestIdFirst)
      .map(toReferenceAdset),
  };
}

const MAX_CAMPAIGN_ADS = 200;
const CAMPAIGN_ADS_FIELDS = `account_id,ads.limit(${MAX_CAMPAIGN_ADS + 1}){id,name,effective_status,creative{thumbnail_url,effective_object_story_id}}`;
const AD_PREVIEW_FORMAT = "DESKTOP_FEED_STANDARD";
const AD_PREVIEW_FIELDS = `account_id,previews.ad_format(${AD_PREVIEW_FORMAT}){body}`;
const PREVIEW_HOSTS = ["facebook.com", "www.facebook.com"];
const IFRAME_SRC = /<iframe\b[^>]*?\ssrc\s*=\s*(["'])(.*?)\1/is;

const campaignAdSchema = z.object({
  id: z.string(),
  name: z.string(),
  effective_status: z.string(),
  creative: z
    .object({
      thumbnail_url: z.string().optional(),
      effective_object_story_id: z.string().optional(),
    })
    .optional(),
});

const campaignAdsSchema = z.object({
  account_id: z.string(),
  ads: z
    .object({
      data: z.array(campaignAdSchema),
      paging: z.object({ next: z.string().optional() }).optional(),
    })
    .optional(),
});

const adPreviewSchema = z.object({
  account_id: z.string(),
  previews: z.object({ data: z.array(z.object({ body: z.string() })) }),
});

export interface CampaignAd {
  adId: string;
  name: string;
  effectiveStatus: string;
  storyId: string | null;
  thumbnailUrl: string | null;
}

export interface CampaignAds {
  accountId: string;
  ads: CampaignAd[];
  truncated: boolean;
}

export interface AdPreview {
  accountId: string;
  iframeSrc: string;
}

export async function getCampaignAds(
  graph: Graph,
  campaignId: string,
): Promise<CampaignAds> {
  const campaign = parse(
    campaignAdsSchema,
    await graph.get<unknown>(campaignId, { fields: CAMPAIGN_ADS_FIELDS }),
  );
  const ads = campaign.ads?.data ?? [];
  return {
    accountId: campaign.account_id,
    ads: ads.slice(0, MAX_CAMPAIGN_ADS).map((ad) => ({
      adId: ad.id,
      name: ad.name,
      effectiveStatus: ad.effective_status,
      storyId: ad.creative?.effective_object_story_id ?? null,
      thumbnailUrl: ad.creative?.thumbnail_url ?? null,
    })),
    truncated: ads.length > MAX_CAMPAIGN_ADS || !!campaign.ads?.paging?.next,
  };
}

function previewIframeSrc(body: string): string {
  const rawSrc = IFRAME_SRC.exec(body)?.[2];
  if (!rawSrc) throw invalidPayloadError();
  const url = URL.parse(rawSrc.replaceAll("&amp;", "&"));
  const trusted =
    url?.protocol === "https:" &&
    PREVIEW_HOSTS.includes(url.hostname) &&
    !url.username &&
    !url.password &&
    !url.port;
  if (!url || !trusted) throw invalidPayloadError();
  return url.href;
}

export async function getAdPreview(
  graph: Graph,
  adId: string,
): Promise<AdPreview> {
  const ad = parse(
    adPreviewSchema,
    await graph.get<unknown>(adId, { fields: AD_PREVIEW_FIELDS }),
  );
  const [preview] = ad.previews.data;
  if (!preview) throw invalidPayloadError();
  return {
    accountId: ad.account_id,
    iframeSrc: previewIframeSrc(preview.body),
  };
}

const AD_CREATIVE_FIELDS =
  "id,creative{thumbnail_url,effective_object_story_id}";

const adCreativeSchema = z.object({
  id: z.string(),
  creative: z
    .object({
      thumbnail_url: z.string().optional(),
      effective_object_story_id: z.string().optional(),
    })
    .optional(),
});

export interface AdCreativeInfo {
  adId: string;
  storyId: string | null;
  thumbnailUrl: string | null;
}

export async function getAdCreatives(
  graph: Graph,
  actId: string,
  adIds: string[],
): Promise<AdCreativeInfo[]> {
  const ads = await fetchEdge(
    graph,
    `${actId}/ads`,
    AD_CREATIVE_FIELDS,
    adCreativeSchema,
    {
      extra: {
        filtering: JSON.stringify([
          { field: "id", operator: "IN", value: adIds },
        ]),
      },
      maxItems: adIds.length,
    },
  );
  return ads.map((ad) => ({
    adId: ad.id,
    storyId: ad.creative?.effective_object_story_id ?? null,
    thumbnailUrl: ad.creative?.thumbnail_url ?? null,
  }));
}
