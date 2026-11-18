import type { InsightRange } from "../../../shared/insight-range";
import type {
  AdPreviewDto,
  CampaignAdDto,
  CampaignAdsResponse,
} from "../../../shared/schemas/meta-campaigns";
import type { Env } from "../../env";
import {
  type CampaignAd,
  getAdPreview,
  getCampaignAds,
  type InsightRow,
  readInsights,
} from "../../integrations/meta/read";
import { AppError, unprocessable } from "../../lib/errors";
import type { Scope } from "../../repositories/scope";
import { assertAssetAccount, getGraphForAsset } from "./connection";
import { rethrowMetaError } from "./meta-error";

function rethrowReadError(error: unknown): never {
  if (error instanceof RangeError) throw unprocessable("RANGE_INVALID");
  return rethrowMetaError(error);
}

function accountFormat(asset: {
  currency: string | null;
  timezoneName: string | null;
}) {
  if (!asset.currency || !asset.timezoneName) {
    throw new AppError(502, "META_ERROR");
  }
  return { currency: asset.currency, timezone: asset.timezoneName };
}

const toAdDto = (ad: CampaignAd, insight?: InsightRow): CampaignAdDto => ({
  ...ad,
  spendMinor: insight?.spendMinor ?? 0,
  purchases: insight?.purchases ?? 0,
  roas: insight?.roas ?? null,
});

export async function campaignAds(
  env: Env,
  scope: Scope,
  campaignId: string,
  adAccountAssetId: string,
  range: InsightRange,
): Promise<CampaignAdsResponse> {
  const { graph, asset } = await getGraphForAsset(
    env.DB,
    env,
    scope,
    adAccountAssetId,
  );
  const format = accountFormat(asset);
  const [campaign, insights] = await Promise.all([
    getCampaignAds(graph, campaignId),
    readInsights(graph, {
      actId: campaignId,
      level: "ad",
      range,
      ...format,
    }),
  ]).catch(rethrowReadError);
  assertAssetAccount(asset, campaign.accountId);
  const insightByAd = new Map(insights.rows.map((row) => [row.id, row]));
  return {
    data: campaign.ads.map((ad) => toAdDto(ad, insightByAd.get(ad.adId))),
    truncated: campaign.truncated,
  };
}

export async function adPreview(
  env: Env,
  scope: Scope,
  adId: string,
  adAccountAssetId: string,
): Promise<AdPreviewDto> {
  const { graph, asset } = await getGraphForAsset(
    env.DB,
    env,
    scope,
    adAccountAssetId,
  );
  const preview = await getAdPreview(graph, adId).catch(rethrowMetaError);
  assertAssetAccount(asset, preview.accountId);
  return { iframeSrc: preview.iframeSrc };
}
