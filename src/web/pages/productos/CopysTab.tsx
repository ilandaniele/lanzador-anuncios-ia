import { Button } from "../../components/Button";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { CopyGenerator } from "../../features/ai/CopyGenerator";
import { SuggestionCard } from "../../features/ai/SuggestionCard";
import { useSavedCopies } from "../../features/launch/use-product-copies";
import { useCanEdit } from "../../features/products/use-can-edit";
import { t } from "../../i18n/es-AR";

type CopysTabProps = { workspaceId: string; productId: string };

export function CopysTab({ workspaceId, productId }: CopysTabProps) {
  const copies = useSavedCopies(workspaceId, productId);
  const canEdit = useCanEdit(workspaceId);

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <CopyGenerator workspaceId={workspaceId} productId={productId} />
      )}
      {copies.isPending && (
        <SkeletonRegion label={t("common.loading")}>
          <Skeleton className="h-28" />
        </SkeletonRegion>
      )}
      {copies.isError && (
        <div role="alert" className="flex items-center gap-2">
          <p className="text-loss">{t("copys.loadError")}</p>
          <Button variant="ghost" onClick={() => void copies.refetch()}>
            {t("errors.retry")}
          </Button>
        </div>
      )}
      {copies.data?.length === 0 && (
        <p className="text-ink-muted">{t("copys.empty")}</p>
      )}
      {copies.data?.map((copy) => (
        <SuggestionCard
          key={copy.id}
          workspaceId={workspaceId}
          copy={copy}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}
