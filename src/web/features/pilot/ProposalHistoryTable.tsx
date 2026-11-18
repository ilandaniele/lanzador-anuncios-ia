import { useEffect, useRef } from "react";
import type { PilotProposalDto } from "../../../shared/schemas/pilot";
import { StatusChip } from "../../components/Chip";
import { cx } from "../../components/classes";
import { DataTable, type Column } from "../../components/DataTable";
import { t } from "../../i18n/es-AR";
import { proposalStatusTone, proposalTitle } from "./proposal-model";

type ProposalHistoryTableProps = {
  proposals: PilotProposalDto[];
  highlightId: string | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

function ProposalCell({
  proposal,
  highlighted,
}: {
  proposal: PilotProposalDto;
  highlighted: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView?.({ block: "center" });
  }, [highlighted]);

  return (
    <div
      ref={ref}
      className={cx(
        "rounded-xs",
        highlighted && "bg-primary-soft p-1 ring-2 ring-primary",
      )}
    >
      <p className="font-medium">{proposalTitle(proposal)}</p>
      <p className="text-ink-muted">{proposal.objectName}</p>
      {highlighted && <p className="sr-only">{t("pilot.history.linked")}</p>}
    </div>
  );
}

const resultOf = ({ status }: PilotProposalDto) =>
  status === "executed"
    ? t("pilot.history.resultOk")
    : status === "failed"
      ? t("pilot.history.resultFailed")
      : t("pilot.history.noResult");

export function ProposalHistoryTable({
  proposals,
  highlightId,
  loading,
  error,
  onRetry,
}: ProposalHistoryTableProps) {
  const columns: Column<PilotProposalDto>[] = [
    {
      key: "when",
      header: t("pilot.history.colWhen"),
      rowHeader: true,
      render: ({ decidedAt, createdAt }) =>
        new Date(decidedAt ?? createdAt).toLocaleString("es-AR"),
    },
    {
      key: "proposal",
      header: t("pilot.history.colProposal"),
      render: (proposal) => (
        <ProposalCell
          proposal={proposal}
          highlighted={proposal.id === highlightId}
        />
      ),
    },
    {
      key: "decision",
      header: t("pilot.history.colDecision"),
      render: ({ status, resultMessage }) => (
        <>
          <StatusChip tone={proposalStatusTone(status)}>
            {t(`pilot.history.status.${status}`)}
          </StatusChip>
          {status === "dismissed" && resultMessage && (
            <p className="mt-1 text-sm text-ink-muted">{resultMessage}</p>
          )}
        </>
      ),
    },
    {
      key: "result",
      header: t("pilot.history.colResult"),
      render: resultOf,
    },
  ];

  return (
    <DataTable
      caption={t("pilot.history.caption")}
      columns={columns}
      rows={proposals}
      getRowKey={({ id }) => id}
      loading={loading}
      error={error ? t("pilot.loadError") : undefined}
      onRetry={onRetry}
      empty={t("pilot.history.empty")}
    />
  );
}
