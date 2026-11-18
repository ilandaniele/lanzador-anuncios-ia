import type {
  CampaignDto,
  CampaignReferenceDto,
  CampaignsResponse,
} from "../../../shared/schemas/meta-campaigns";
import type { Env } from "../../env";
import {
  getCampaignReference,
  listCampaigns,
  type MetaCampaign,
} from "../../integrations/meta/read";
import { cachedJson } from "../../lib/edge-cache";
import { unprocessable } from "../../lib/errors";
import type { Scope } from "../../repositories/scope";
import { assertAssetAccount, getGraphForAsset } from "./connection";
import { rethrowMetaError } from "./meta-error";

const CAMPAIGNS_CACHE_TTL_SECONDS = 60;

const toCampaignDto = (campaign: MetaCampaign): CampaignDto => ({
  ...campaign,
  isCbo: campaign.dailyBudgetMinor !== null,
});

export async function listAccountCampaigns(
  env: Env,
  scope: Scope,
  assetId: string,
  statuses: string[],
): Promise<CampaignsResponse> {
  const { graph, asset } = await getGraphForAsset(env.DB, env, scope, assetId);
  return cachedJson(
    `meta-campaigns/${scope.workspaceId}/${asset.id}?status=${statuses.join(",")}`,
    CAMPAIGNS_CACHE_TTL_SECONDS,
    async () => {
      const { campaigns, truncated } = await listCampaigns(
        graph,
        asset.metaId,
        statuses,
      ).catch(rethrowMetaError);
      return { data: campaigns.map(toCampaignDto), truncated };
    },
  );
}

export async function campaignReference(
  env: Env,
  scope: Scope,
  campaignId: string,
  adAccountAssetId: string,
): Promise<CampaignReferenceDto> {
  const { graph, asset } = await getGraphForAsset(
    env.DB,
    env,
    scope,
    adAccountAssetId,
  );
  const campaign = await getCampaignReference(graph, campaignId).catch(
    rethrowMetaError,
  );
  assertAssetAccount(asset, campaign.accountId);
  if (campaign.dailyBudgetMinor === null) throw unprocessable("NOT_CBO");
  const [newest] = campaign.adsets;
  if (!newest) throw unprocessable("NO_REFERENCE_ADSET");
  return {
    adsetName: newest.name,
    optimizationGoal: newest.optimizationGoal,
    customEventType: newest.customEventType,
    pixelId: newest.pixelId,
    bidStrategy: campaign.bidStrategy,
    bidAmountMinor: newest.bidAmountMinor,
    countries: newest.countries,
    dailyBudgetMinor: campaign.dailyBudgetMinor,
    nextAdsetNumber: campaign.adsets.length + 1,
  };
}
