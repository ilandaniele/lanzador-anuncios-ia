import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { LoadMoreButton } from "../../features/admin/LoadMoreButton";
import { ProposalCardList } from "../../features/pilot/ProposalCardList";
import { usePendingProposals } from "../../features/pilot/use-proposals";
import { t } from "../../i18n/es-AR";
import type { PilotTabProps } from "./tabs";

export default function PendingTab({
  workspaceId,
  highlightId,
}: PilotTabProps) {
  const pending = usePendingProposals(workspaceId);
  const proposals = pending.data?.pages.flatMap((page) => page.data) ?? [];

  if (pending.isPending)
    return (
      <SkeletonRegion label={t("pilot.loading")} className="grid gap-3">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </SkeletonRegion>
    );

  if (pending.isError)
    return (
      <div role="alert" className="flex items-center gap-3">
        <p className="text-loss">{t("pilot.loadError")}</p>
        <Button variant="secondary" onClick={() => void pending.refetch()}>
          {t("errors.retry")}
        </Button>
      </div>
    );

  if (proposals.length === 0)
    return <EmptyState message={t("pilot.emptyPending")} />;

  return (
    <div className="max-w-180">
      <h2 className="sr-only">{t("pilot.tabs.pending")}</h2>
      <ProposalCardList
        workspaceId={workspaceId}
        proposals={proposals}
        highlightId={highlightId}
      />
      {pending.hasNextPage && (
        <LoadMoreButton
          loading={pending.isFetchingNextPage}
          onClick={() => void pending.fetchNextPage()}
        />
      )}
    </div>
  );
}
