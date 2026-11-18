import type { PilotProposalDto } from "../../../shared/schemas/pilot";
import { qk } from "../../lib/query-keys";
import { useCursorPages } from "../history/use-history";

const proposalsPath = (workspaceId: string) =>
  `/api/w/${workspaceId}/pilot/proposals`;

export const usePendingProposals = (workspaceId: string) =>
  useCursorPages<PilotProposalDto>(
    qk.pilotPending(workspaceId),
    proposalsPath(workspaceId),
    { status: "pending" },
  );

const useHistoryStatus = (
  workspaceId: string,
  status: "executed" | "dismissed" | "failed",
) =>
  useCursorPages<PilotProposalDto>(
    qk.pilotHistoryStatus(workspaceId, status),
    proposalsPath(workspaceId),
    { status },
  );

const resolvedAt = ({ decidedAt, createdAt }: PilotProposalDto) =>
  decidedAt ?? createdAt;

export function useProposalHistory(workspaceId: string) {
  const queries = [
    useHistoryStatus(workspaceId, "executed"),
    useHistoryStatus(workspaceId, "dismissed"),
    useHistoryStatus(workspaceId, "failed"),
  ];
  const withMore = queries.filter((query) => query.hasNextPage);

  return {
    proposals: queries
      .flatMap((query) => query.data?.pages.flatMap((page) => page.data) ?? [])
      .sort((a, b) => resolvedAt(b).localeCompare(resolvedAt(a))),
    isPending: queries.some((query) => query.isPending),
    isError: queries.some((query) => query.isError),
    hasNextPage: withMore.length > 0,
    isFetchingNextPage: queries.some((query) => query.isFetchingNextPage),
    fetchNextPage: () =>
      Promise.all(withMore.map((query) => query.fetchNextPage())),
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  };
}
