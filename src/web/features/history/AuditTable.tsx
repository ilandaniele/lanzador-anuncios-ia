import type { AuditEntryDto } from "../../../shared/schemas/audit";
import { NeutralChip, StatusChip } from "../../components/Chip";
import { DataTable, type Column } from "../../components/DataTable";
import { t } from "../../i18n/es-AR";
import { AuditEntryAction } from "./AuditEntryAction";

type AuditTableProps = {
  workspaceId: string;
  entries: AuditEntryDto[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

export function AuditTable({
  workspaceId,
  entries,
  loading,
  error,
  onRetry,
}: AuditTableProps) {
  const columns: Column<AuditEntryDto>[] = [
    {
      key: "when",
      header: t("history.audit.colWhen"),
      rowHeader: true,
      render: ({ createdAt }) => new Date(createdAt).toLocaleString("es-AR"),
    },
    {
      key: "who",
      header: t("history.audit.colWho"),
      render: ({ actorEmail }) => actorEmail ?? t("history.audit.noActor"),
    },
    {
      key: "what",
      header: t("history.audit.colWhat"),
      render: (entry) => (
        <AuditEntryAction workspaceId={workspaceId} entry={entry} />
      ),
    },
    {
      key: "object",
      header: t("history.audit.colObject"),
      render: ({ objectId }) => objectId ?? t("history.audit.noObject"),
    },
    {
      key: "origin",
      header: t("history.audit.colOrigin"),
      render: ({ origin }) => (
        <NeutralChip>{t(`history.audit.origin.${origin}`)}</NeutralChip>
      ),
    },
    {
      key: "result",
      header: t("history.audit.colResult"),
      render: ({ result }) => (
        <StatusChip tone={result === "ok" ? "ready" : "error"}>
          {t(`history.audit.result.${result}`)}
        </StatusChip>
      ),
    },
  ];

  return (
    <DataTable
      caption={t("history.audit.caption")}
      columns={columns}
      rows={entries}
      getRowKey={({ id }) => id}
      loading={loading}
      error={error ? t("history.loadError") : undefined}
      onRetry={onRetry}
      empty={t("history.audit.empty")}
    />
  );
}
