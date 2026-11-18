import { useState } from "react";
import { Button } from "../../components/Button";
import { Combobox } from "../../components/Combobox";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { t } from "../../i18n/es-AR";
import { CampaignAdList } from "./CampaignAdList";
import { itemFromAd, type DraftItem } from "./draft-items";
import { useCampaignAds } from "./use-campaign-ads";
import { useCampaigns } from "./use-campaigns";
import type { ChangeItems } from "./use-draft-items";

type CopyFromCampaignProps = {
  workspaceId: string;
  adAccountAssetId: string | null;
  items: DraftItem[];
  changeItems: ChangeItems;
};

export function CopyFromCampaign({
  workspaceId,
  adAccountAssetId,
  items,
  changeItems,
}: CopyFromCampaignProps) {
  const accountId = adAccountAssetId ?? "";
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const campaigns = useCampaigns(workspaceId, accountId);
  const ads = useCampaignAds(workspaceId, accountId, campaignId ?? "");

  if (!adAccountAssetId)
    return (
      <p className="text-ink-muted">{t("launcher.step4.chooseAccount")}</p>
    );

  return (
    <div className="flex flex-col gap-3">
      <Combobox
        label={t("launcher.step4.campaignLabel")}
        emptyText={t("launcher.step4.noCampaigns")}
        loading={campaigns.isPending}
        loadError={campaigns.isError ? t("combobox.error") : undefined}
        onRetry={() => void campaigns.refetch()}
        options={(campaigns.data?.data ?? []).map(
          ({ id, name, effectiveStatus }) => ({
            value: id,
            label: name,
            description: effectiveStatus,
          }),
        )}
        value={campaignId}
        onChange={setCampaignId}
      />
      {ads.isPending && ads.fetchStatus !== "idle" && (
        <SkeletonRegion label={t("common.loading")}>
          <Skeleton className="h-16" />
        </SkeletonRegion>
      )}
      {ads.isError && (
        <div role="alert" className="flex items-center gap-2">
          <p className="text-loss">{t("launcher.step4.adsFailed")}</p>
          <Button variant="ghost" onClick={() => void ads.refetch()}>
            {t("errors.retry")}
          </Button>
        </div>
      )}
      {ads.data && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-medium">
            {t("launcher.step4.adsLegend")}
          </legend>
          <p className="text-ink-muted">{t("launcher.step4.adsHint")}</p>
          {ads.data.data.length === 0 && (
            <p className="text-ink-muted">{t("launcher.step4.adsEmpty")}</p>
          )}
          {ads.data.truncated && (
            <p role="status" className="text-warn">
              {t("launcher.step4.adsTruncated")}
            </p>
          )}
          <CampaignAdList
            ads={ads.data.data}
            isChosen={({ adId }) =>
              items.some((item) => item.cloneAdId === adId)
            }
            onToggle={(ad) =>
              changeItems((current) =>
                current.some((item) => item.cloneAdId === ad.adId)
                  ? current.filter((item) => item.cloneAdId !== ad.adId)
                  : [...current, itemFromAd(ad)],
              )
            }
          />
        </fieldset>
      )}
    </div>
  );
}
