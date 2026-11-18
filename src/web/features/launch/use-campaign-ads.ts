import { useQuery } from "@tanstack/react-query";
import type { CampaignAdsResponse } from "../../../shared/schemas/meta-campaigns";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

export const useCampaignAds = (
  workspaceId: string,
  adAccountAssetId: string,
  campaignId: string,
) =>
  useQuery({
    queryKey: qk.metaCampaignAds(workspaceId, adAccountAssetId, campaignId),
    enabled: adAccountAssetId !== "" && campaignId !== "",
    queryFn: () =>
      apiFetch<CampaignAdsResponse>(
        `/api/w/${workspaceId}/meta/campaigns/${campaignId}/ads?adAccountAssetId=${adAccountAssetId}`,
      ),
  });
