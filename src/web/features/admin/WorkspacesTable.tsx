import type { AdminWorkspaceDto } from "../../../shared/schemas/admin";
import { Button } from "../../components/Button";
import { DataTable, type Column } from "../../components/DataTable";
import { t } from "../../i18n/es-AR";
import { formatLastActivity } from "./format-last-activity";
import type { StatusActionKind } from "./StatusActionDialog";
import { MetaStatusChip, WorkspaceStatusChip } from "./StatusChips";

export type WorkspaceAction = {
  kind: StatusActionKind | "credits";
  workspace: AdminWorkspaceDto;
};

type WorkspacesTableProps = {
  workspaces: AdminWorkspaceDto[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onAction: (action: WorkspaceAction) => void;
};

export function WorkspacesTable({
  workspaces,
  loading,
  error,
  onRetry,
  onAction,
}: WorkspacesTableProps) {
  function renderActions(workspace: AdminWorkspaceDto) {
    return (
      <div className="flex flex-wrap gap-2">
        {workspace.status === "active" && (
          <Button
            variant="ghost"
            onClick={() => onAction({ kind: "suspend", workspace })}
          >
            {t("admin.suspend")}
          </Button>
        )}
        {workspace.status === "deleting" && (
          <Button
            variant="ghost"
            onClick={() => onAction({ kind: "restore", workspace })}
          >
            {t("admin.restore")}
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => onAction({ kind: "credits", workspace })}
        >
          {t("admin.credits")}
        </Button>
      </div>
    );
  }

  const columns: Column<AdminWorkspaceDto>[] = [
    {
      key: "name",
      header: t("admin.colName"),
      render: ({ name, ownerEmail }) => (
        <>
          <span className="block">{name}</span>
          <span className="block text-ink-muted">{ownerEmail}</span>
        </>
      ),
      rowHeader: true,
    },
    {
      key: "status",
      header: t("admin.colStatus"),
      render: ({ status }) => <WorkspaceStatusChip status={status} />,
    },
    { key: "plan", header: t("admin.colPlan"), render: ({ planId }) => planId },
    {
      key: "meta",
      header: t("admin.colMeta"),
      render: ({ metaStatus }) => <MetaStatusChip status={metaStatus} />,
    },
    {
      key: "members",
      header: t("admin.colMembers"),
      render: ({ memberCount }) => memberCount,
      numeric: true,
    },
    {
      key: "lastActivity",
      header: t("admin.colLastActivity"),
      render: ({ lastActivityAt }) => formatLastActivity(lastActivityAt),
    },
    {
      key: "aiMonth",
      header: t("admin.colAiMonth"),
      render: ({ aiNeuronsMonth }) => aiNeuronsMonth.toLocaleString("es-AR"),
      numeric: true,
    },
    {
      key: "actions",
      header: t("admin.colActions"),
      render: renderActions,
    },
  ];

  return (
    <DataTable
      caption={t("admin.caption")}
      columns={columns}
      rows={workspaces}
      getRowKey={({ id }) => id}
      loading={loading}
      error={error ? t("admin.loadError") : undefined}
      onRetry={onRetry}
      empty={t("admin.empty")}
    />
  );
}
