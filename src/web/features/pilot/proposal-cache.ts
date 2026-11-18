import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { PilotProposalDto } from "../../../shared/schemas/pilot";
import type { TodayResponse } from "../../../shared/schemas/today";
import { qk } from "../../lib/query-keys";

type ProposalPage = { data: PilotProposalDto[]; nextCursor: string | null };
type ProposalPages = InfiniteData<ProposalPage>;
type ProposalsChange = (proposals: PilotProposalDto[]) => PilotProposalDto[];

const mapPages = (data: ProposalPages | undefined, change: ProposalsChange) =>
  data && {
    ...data,
    pages: data.pages.map((page) => ({ ...page, data: change(page.data) })),
  };

function patchProposals(
  queryClient: QueryClient,
  workspaceId: string,
  change: ProposalsChange,
  pendingCountDelta: number,
) {
  queryClient.setQueriesData<ProposalPages>(
    { queryKey: qk.pilotPending(workspaceId) },
    (data) => mapPages(data, change),
  );
  queryClient.setQueryData<TodayResponse>(
    qk.today(workspaceId),
    (today) =>
      today && {
        ...today,
        proposals: {
          pendingCount: Math.max(
            0,
            today.proposals.pendingCount + pendingCountDelta,
          ),
          top: change(today.proposals.top),
        },
      },
  );
}

export const replaceProposal = (
  queryClient: QueryClient,
  workspaceId: string,
  replacement: PilotProposalDto,
) =>
  patchProposals(
    queryClient,
    workspaceId,
    (proposals) =>
      proposals.map((proposal) =>
        proposal.id === replacement.id ? replacement : proposal,
      ),
    0,
  );

export const removeProposal = (
  queryClient: QueryClient,
  workspaceId: string,
  id: string,
) =>
  patchProposals(
    queryClient,
    workspaceId,
    (proposals) => proposals.filter((proposal) => proposal.id !== id),
    -1,
  );
