import type { CreativeDto } from "../../../shared/schemas/creatives";
import { Button } from "../../components/Button";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { t } from "../../i18n/es-AR";
import { CreativeEntry, type CreativeLayout } from "./CreativeEntry";
import type { useCreatives } from "./use-creatives";

const SKELETON_CARDS = 8;
const GRID_CLASS = "grid grid-cols-2 gap-4 lg:grid-cols-4 2xl:grid-cols-6";
const LIST_CLASS = "flex flex-col gap-2";

const layoutClass = (layout: CreativeLayout) =>
  layout === "grid" ? GRID_CLASS : LIST_CLASS;

type CreativeGridProps = {
  query: ReturnType<typeof useCreatives>;
  creatives: CreativeDto[];
  layout: CreativeLayout;
  filtered: boolean;
  selectable: boolean;
  chosenIds: ReadonlySet<string>;
  onToggle: (creativeId: string) => void;
  onOpen: (creativeId: string) => void;
};

export function CreativeGrid({
  query,
  creatives,
  layout,
  filtered,
  selectable,
  chosenIds,
  onToggle,
  onOpen,
}: CreativeGridProps) {
  if (query.isPending)
    return (
      <SkeletonRegion
        label={t("creatives.loading")}
        className={layoutClass("grid")}
      >
        {Array.from({ length: SKELETON_CARDS }, (_, index) => (
          <Skeleton key={index} className="aspect-[4/5] h-auto" />
        ))}
      </SkeletonRegion>
    );
  if (query.isError)
    return (
      <div className="flex flex-col items-center gap-2 py-6">
        <p role="alert" className="text-loss">
          {t("creatives.loadError")}
        </p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          {t("errors.retry")}
        </Button>
      </div>
    );
  if (creatives.length === 0)
    return (
      <p className="py-6 text-center text-ink-muted">
        {t(filtered ? "creatives.emptyFiltered" : "creatives.empty")}
      </p>
    );

  return (
    <>
      <ul aria-label={t("creatives.listLabel")} className={layoutClass(layout)}>
        {creatives.map((creative) => (
          <CreativeEntry
            key={creative.id}
            creative={creative}
            layout={layout}
            selectable={selectable}
            chosen={chosenIds.has(creative.id)}
            onToggle={() => onToggle(creative.id)}
            onOpen={() => onOpen(creative.id)}
          />
        ))}
      </ul>
      {query.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            loading={query.isFetchingNextPage}
            loadingLabel={t("common.working")}
            onClick={() => void query.fetchNextPage()}
          >
            {t("creatives.loadMore")}
          </Button>
        </div>
      )}
    </>
  );
}
