import { t } from "../i18n/es-AR";
import { Skeleton, SkeletonRegion } from "./Skeleton";

export function PageSkeleton() {
  return (
    <SkeletonRegion
      label={t("common.loading")}
      className="flex flex-col gap-4 p-4"
    >
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </SkeletonRegion>
  );
}
