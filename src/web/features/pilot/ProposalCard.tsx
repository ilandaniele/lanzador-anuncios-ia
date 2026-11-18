import { useEffect, useId, useRef, useState } from "react";
import type { PilotProposalDto } from "../../../shared/schemas/pilot";
import { Button } from "../../components/Button";
import { cx } from "../../components/classes";
import { t } from "../../i18n/es-AR";
import { ApproveDialog } from "./ApproveDialog";
import { ApprovedStamp } from "./ApprovedStamp";
import { DismissForm } from "./DismissForm";
import { isApproved, proposalTitle } from "./proposal-model";
import { ProposalEvidence } from "./ProposalEvidence";
import { ProposalExplanation } from "./ProposalExplanation";
import type { ProposalAccount } from "./use-proposal-context";
import {
  useProposalDecisions,
  useSettleProposal,
} from "./use-proposal-decisions";

const COLLAPSE_MS = 2000;

type ProposalCardProps = {
  workspaceId: string;
  proposal: PilotProposalDto;
  account?: ProposalAccount;
  canDecide: boolean;
  highlighted: boolean;
};

export function ProposalCard({
  workspaceId,
  proposal,
  account,
  canDecide,
  highlighted,
}: ProposalCardProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLLIElement>(null);
  const [approving, setApproving] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const { dismiss } = useProposalDecisions(workspaceId, proposal);
  const settle = useSettleProposal(workspaceId);
  const approved = isApproved(proposal);

  useEffect(() => {
    if (highlighted) cardRef.current?.scrollIntoView?.({ block: "center" });
  }, [highlighted]);

  useEffect(() => {
    if (!approved) return;
    const timer = setTimeout(() => settle(proposal.id), COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [approved, proposal.id, settle]);

  return (
    <li
      ref={cardRef}
      aria-labelledby={titleId}
      className={cx(
        "flex flex-col gap-3 rounded-md border bg-surface p-4",
        approved ? "border-2 border-ink" : "border-dashed border-pencil",
        highlighted && "ring-2 ring-primary",
      )}
    >
      <div>
        <h3 id={titleId} className="text-lg font-semibold">
          {proposalTitle(proposal)}
        </h3>
        <p className="text-ink-muted">
          {proposal.objectName}
          {account && ` · ${account.name}`}
        </p>
      </div>
      <ProposalEvidence proposal={proposal} currency={account?.currency} />
      {proposal.explanation && (
        <ProposalExplanation text={proposal.explanation} />
      )}
      <p className="text-sm text-ink-muted">
        {t("pilot.rule.label")}: {t(`pilot.rule.${proposal.ruleType}`)}
      </p>
      {approved && <ApprovedStamp decidedAt={proposal.decidedAt} />}
      {canDecide && !approved && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="w-full sm:w-auto"
            aria-label={`${t("pilot.approve")} ${proposal.objectName}`}
            onClick={() => setApproving(true)}
          >
            {t("pilot.approve")}
          </Button>
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            aria-label={`${t("pilot.dismiss")} ${proposal.objectName}`}
            aria-expanded={dismissing}
            onClick={() => setDismissing(!dismissing)}
          >
            {t("pilot.dismiss")}
          </Button>
        </div>
      )}
      {dismissing && !approved && (
        <DismissForm
          submitting={dismiss.isPending}
          onSubmit={(reason) => dismiss.mutate({ reason })}
          onCancel={() => setDismissing(false)}
        />
      )}
      {approving && !approved && (
        <ApproveDialog
          workspaceId={workspaceId}
          proposal={proposal}
          account={account}
          onClose={() => setApproving(false)}
        />
      )}
    </li>
  );
}
