const ADS_MANAGER_CAMPAIGNS =
  "https://adsmanager.facebook.com/adsmanager/manage/campaigns";
const AD_ACCOUNT_PREFIX = "act_";

export function metaCampaignUrl(
  adAccountMetaId: string | null,
  campaignId: string | null,
) {
  if (!adAccountMetaId || !campaignId) return null;
  const params = new URLSearchParams({
    act: adAccountMetaId.replace(AD_ACCOUNT_PREFIX, ""),
    selected_campaign_ids: campaignId,
  });
  return `${ADS_MANAGER_CAMPAIGNS}?${params}`;
}
