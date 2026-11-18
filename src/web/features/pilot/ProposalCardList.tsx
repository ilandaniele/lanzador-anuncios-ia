import type { PilotProposalDto } from "../../../shared/schemas/pilot";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { t } from "../../i18n/es-AR";
import { ProposalCard } from "./ProposalCard";
import { useProposalContext } from "./use-proposal-context";

type ProposalCardListProps = {
  workspaceId: string;
  proposals: PilotProposalDto[];
  highlightId?: string | null;
};

export function ProposalCardList({
  workspaceId,
  proposals,
  highlightId = null,
}: ProposalCardListProps) {
  const { loading, accountOf, canDecide } = useProposalContext(workspaceId);

  if (loading)
    return (
      <SkeletonRegion label={t("pilot.loading")} className="grid gap-3">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </SkeletonRegion>
    );

  return (
    <ul className="flex flex-col gap-3">
      {proposals.map((proposal) => (
        <ProposalCard
          key={proposal.id}
          workspaceId={workspaceId}
          proposal={proposal}
          account={accountOf(proposal.adAccountId)}
          canDecide={canDecide}
          highlighted={proposal.id === highlightId}
        />
      ))}
    </ul>
  );
}
