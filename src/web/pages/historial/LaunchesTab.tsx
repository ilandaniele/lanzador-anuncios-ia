import { useState } from "react";
import type { LaunchListItemDto } from "../../../shared/schemas/launch";
import { LoadMoreButton } from "../../features/admin/LoadMoreButton";
import { ActivateFromHistory } from "../../features/history/ActivateFromHistory";
import { LaunchesTable } from "../../features/history/LaunchesTable";
import { useLaunchHistory } from "../../features/history/use-history";

export function LaunchesTab({ workspaceId }: { workspaceId: string }) {
  const launches = useLaunchHistory(workspaceId);
  const [activating, setActivating] = useState<LaunchListItemDto | null>(null);

  return (
    <>
      <LaunchesTable
        workspaceId={workspaceId}
        launches={launches.data?.pages.flatMap((page) => page.data) ?? []}
        loading={launches.isPending}
        error={launches.isError}
        onRetry={() => void launches.refetch()}
        onActivate={setActivating}
      />
      {launches.hasNextPage && (
        <LoadMoreButton
          loading={launches.isFetchingNextPage}
          onClick={() => void launches.fetchNextPage()}
        />
      )}
      {activating && (
        <ActivateFromHistory
          workspaceId={workspaceId}
          launch={activating}
          onClose={() => setActivating(null)}
        />
      )}
    </>
  );
}
