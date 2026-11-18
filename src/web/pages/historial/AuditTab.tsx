import { useState } from "react";
import { LoadMoreButton } from "../../features/admin/LoadMoreButton";
import { AuditFilters } from "../../features/history/AuditFilters";
import { AuditTable } from "../../features/history/AuditTable";
import {
  useAuditHistory,
  type AuditFilters as Filters,
} from "../../features/history/use-history";

const NO_FILTERS: Filters = { origin: "", actorUserId: "" };

export function AuditTab({ workspaceId }: { workspaceId: string }) {
  const [filters, setFilters] = useState(NO_FILTERS);
  const audit = useAuditHistory(workspaceId, filters);

  return (
    <>
      <AuditFilters
        workspaceId={workspaceId}
        filters={filters}
        onChange={setFilters}
      />
      <AuditTable
        workspaceId={workspaceId}
        entries={audit.data?.pages.flatMap((page) => page.data) ?? []}
        loading={audit.isPending}
        error={audit.isError}
        onRetry={() => void audit.refetch()}
      />
      {audit.hasNextPage && (
        <LoadMoreButton
          loading={audit.isFetchingNextPage}
          onClick={() => void audit.fetchNextPage()}
        />
      )}
    </>
  );
}
