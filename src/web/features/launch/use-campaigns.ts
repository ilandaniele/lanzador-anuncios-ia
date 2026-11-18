import { useQuery } from "@tanstack/react-query";
import type {
  CampaignReferenceDto,
  CampaignsResponse,
} from "../../../shared/schemas/meta-campaigns";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

const LISTED_STATUSES = "ACTIVE,PAUSED";

export const useCampaigns = (workspaceId: string, adAccountAssetId: string) =>
  useQuery({
    queryKey: qk.metaCampaigns(workspaceId, adAccountAssetId),
    enabled: adAccountAssetId !== "",
    queryFn: () =>
      apiFetch<CampaignsResponse>(
        `/api/w/${workspaceId}/meta/ad-accounts/${adAccountAssetId}/campaigns?status=${LISTED_STATUSES}`,
      ),
  });

export const useCampaignReference = (
  workspaceId: string,
  adAccountAssetId: string,
  campaignId: string,
) =>
  useQuery({
    queryKey: qk.metaCampaignReference(
      workspaceId,
      adAccountAssetId,
      campaignId,
    ),
    enabled: adAccountAssetId !== "" && campaignId !== "",
    retry: false,
    queryFn: () =>
      apiFetch<CampaignReferenceDto>(
        `/api/w/${workspaceId}/meta/campaigns/${campaignId}/reference?adAccountAssetId=${adAccountAssetId}`,
      ),
  });
