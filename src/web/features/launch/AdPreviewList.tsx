import { useMemo } from "react";
import type {
  LaunchPlan,
  PartialLaunchDraft,
} from "../../../shared/schemas/launch";
import { t } from "../../i18n/es-AR";
import {
  CREATIVE_POLL_MS,
  useCreativeStatuses,
} from "../uploads/use-creative-statuses";
import { AdPreviewCard } from "./AdPreviewCard";

type AdPreviewListProps = {
  workspaceId: string;
  draft: PartialLaunchDraft;
  plan?: LaunchPlan;
  pageName?: string;
};

export function AdPreviewList({
  workspaceId,
  draft,
  plan,
  pageName,
}: AdPreviewListProps) {
  const items = draft.items ?? [];
  const creatives = useCreativeStatuses(
    workspaceId,
    items.flatMap(({ creativeId }) => creativeId ?? []),
    CREATIVE_POLL_MS,
  );
  const creativeById = useMemo(
    () => new Map((creatives.data ?? []).map((c) => [c.id, c])),
    [creatives.data],
  );

  return (
    <section aria-labelledby="ad-previews-title">
      <h3 id="ad-previews-title" className="mb-3 font-semibold">
        {t("launcher.review.previewsTitle")}
      </h3>
      <div className="flex flex-wrap gap-4">
        {items.map((item, position) => (
          <AdPreviewCard
            key={`${item.creativeId ?? item.cloneAdId}-${position}`}
            adName={item.adName}
            pageName={pageName}
            copy={item.source === "clone" ? undefined : draft.copy}
            creative={
              item.creativeId ? creativeById.get(item.creativeId) : undefined
            }
            link={plan?.ads.find((ad) => ad.position === position)?.link}
          />
        ))}
      </div>
    </section>
  );
}
