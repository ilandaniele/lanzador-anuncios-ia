import { LoadMoreButton } from "../../features/admin/LoadMoreButton";
import { ProposalHistoryTable } from "../../features/pilot/ProposalHistoryTable";
import { useProposalHistory } from "../../features/pilot/use-proposals";
import type { PilotTabProps } from "./tabs";

export default function HistoryTab({
  workspaceId,
  highlightId,
}: PilotTabProps) {
  const history = useProposalHistory(workspaceId);

  return (
    <>
      <ProposalHistoryTable
        proposals={history.proposals}
        highlightId={highlightId}
        loading={history.isPending}
        error={history.isError}
        onRetry={() => void history.refetch()}
      />
      {history.hasNextPage && (
        <LoadMoreButton
          loading={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        />
      )}
    </>
  );
}
