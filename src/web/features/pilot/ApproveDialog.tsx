import type { PilotProposalDto } from "../../../shared/schemas/pilot";
import { ConfirmDialog, type ReceiptRow } from "../../components/ConfirmDialog";
import { t } from "../../i18n/es-AR";
import { formatMoney } from "../../lib/money";
import { approveErrorMessage } from "./approve-errors";
import { proposalTitle } from "./proposal-model";
import type { ProposalAccount } from "./use-proposal-context";
import { useProposalDecisions } from "./use-proposal-decisions";

type ApproveDialogProps = {
  workspaceId: string;
  proposal: PilotProposalDto;
  account?: ProposalAccount;
  onClose: () => void;
};

function changeValue(
  {
    action,
    currentBudgetMinor,
    proposedBudgetMinor,
    percent,
  }: PilotProposalDto,
  money: (minor: number) => string,
) {
  if (action === "pause") return t("pilot.receipt.pauseChange");
  if (action === "duplicate") return t("pilot.receipt.duplicateChange");
  return `${money(currentBudgetMinor ?? 0)} → ${money(proposedBudgetMinor ?? 0)}, +${percent ?? 0} %`;
}

export function ApproveDialog({
  workspaceId,
  proposal,
  account,
  onClose,
}: ApproveDialogProps) {
  const { approve } = useProposalDecisions(workspaceId, proposal);
  const money = (minor: number) => formatMoney(minor, account?.currency);
  const { action, proposedBudgetMinor, objectName } = proposal;
  const finalBudget = action === "scale" ? proposedBudgetMinor : null;
  const rows: ReceiptRow[] = [
    { label: t("pilot.receipt.object"), value: objectName },
    ...(account
      ? [{ label: t("pilot.receipt.account"), value: account.name }]
      : []),
    { label: t("pilot.receipt.change"), value: changeValue(proposal, money) },
  ];

  return (
    <ConfirmDialog
      title={proposalTitle(proposal)}
      amount={
        finalBudget === null
          ? undefined
          : `${money(finalBudget)} ${t("metrics.actions.perDay")}`
      }
      rows={rows}
      consequence={t(`pilot.receipt.consequence.${action}`)}
      confirmLabel={
        finalBudget === null
          ? t("pilot.approve")
          : `${t("pilot.receipt.scaleConfirm")} ${money(finalBudget)}`
      }
      submitting={approve.isPending}
      errorMessage={
        approve.isError ? approveErrorMessage(approve.error) : undefined
      }
      onConfirm={() =>
        approve.mutate(
          {
            confirm: true,
            ...(finalBudget === null
              ? {}
              : { proposedBudgetMinor: finalBudget }),
          },
          { onSuccess: onClose },
        )
      }
      onCancel={onClose}
    />
  );
}
