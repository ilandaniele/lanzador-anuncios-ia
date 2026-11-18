import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { itemFromAd } from "../../features/launch/draft-items";
import { useCreateDraft } from "../../features/launch/use-draft";
import { isRangeComplete } from "../../features/metrics/metrics-filters";
import { TopAdCard } from "../../features/metrics/TopAdCard";
import { TopAdsSelectionBar } from "../../features/metrics/TopAdsSelectionBar";
import { useTopAds } from "../../features/metrics/use-top-ads";
import { useCanEdit } from "../../features/products/use-can-edit";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";
import type { MetricsTabProps } from "./tabs";

const SKELETON_CARDS = 8;
const GRID_CLASS = "grid grid-cols-2 gap-4 lg:grid-cols-4 2xl:grid-cols-6";

export default function TopAdsTab({ workspaceId, filters }: MetricsTabProps) {
  const navigate = useNavigate();
  const topAds = useTopAds(workspaceId, filters);
  const createDraft = useCreateDraft(workspaceId);
  const canEdit = useCanEdit(workspaceId);
  const [chosenIds, setChosenIds] = useState<ReadonlySet<string>>(new Set());

  if (!isRangeComplete(filters))
    return <p className="text-ink-muted">{t("metrics.customHint")}</p>;
  if (topAds.isPending)
    return (
      <SkeletonRegion
        label={t("metrics.topAds.loading")}
        className={GRID_CLASS}
      >
        {Array.from({ length: SKELETON_CARDS }, (_, index) => (
          <Skeleton key={index} className="h-48" />
        ))}
      </SkeletonRegion>
    );
  if (topAds.isError)
    return (
      <div className="flex flex-col items-center gap-2 py-6">
        <p role="alert" className="text-loss">
          {t("metrics.topAds.loadError")}
        </p>
        <Button variant="secondary" onClick={() => void topAds.refetch()}>
          {t("errors.retry")}
        </Button>
      </div>
    );

  const ads = topAds.data.data.filter(
    ({ adAccountId }) =>
      !filters.adAccountId || adAccountId === filters.adAccountId,
  );
  if (ads.length === 0)
    return (
      <p className="py-6 text-center text-ink-muted">
        {t("metrics.topAds.empty")}
      </p>
    );

  const chosen = ads.filter(({ adId }) => chosenIds.has(adId));
  const lockedAccountId = chosen[0]?.adAccountId;

  const toggle = (adId: string) =>
    setChosenIds((current) => {
      const next = new Set(current);
      if (!next.delete(adId)) next.add(adId);
      return next;
    });

  const useInLaunch = () =>
    createDraft.mutate(
      {
        source: "top_ads",
        draft: {
          adAccountAssetId: lockedAccountId,
          ...(filters.productId ? { productId: filters.productId } : {}),
          items: chosen.map(itemFromAd),
        },
      },
      {
        onSuccess: ({ id }) =>
          navigate(workspacePath(workspaceId, `lanzador/${id}`)),
      },
    );

  return (
    <>
      <ul className={GRID_CLASS}>
        {ads.map((ad) => {
          const isChosen = chosenIds.has(ad.adId);
          return (
            <TopAdCard
              key={ad.adId}
              ad={ad}
              selectable={canEdit}
              chosen={isChosen}
              blocked={
                !isChosen &&
                lockedAccountId !== undefined &&
                ad.adAccountId !== lockedAccountId
              }
              onToggle={() => toggle(ad.adId)}
            />
          );
        })}
      </ul>
      {chosen.length > 0 && (
        <TopAdsSelectionBar
          count={chosen.length}
          creating={createDraft.isPending}
          failed={createDraft.isError}
          onUse={useInLaunch}
        />
      )}
    </>
  );
}
