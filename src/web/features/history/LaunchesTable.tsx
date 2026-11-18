import { Link } from "react-router";
import type { LaunchListItemDto } from "../../../shared/schemas/launch";
import { Button } from "../../components/Button";
import { StatusChip } from "../../components/Chip";
import { DataTable, type Column } from "../../components/DataTable";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";
import { statusLabel } from "../launch/progress-model";
import { canActivateFromHistory, launchStatusTone } from "./launch-model";

type LaunchesTableProps = {
  workspaceId: string;
  launches: LaunchListItemDto[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onActivate: (launch: LaunchListItemDto) => void;
};

const productName = ({ productName }: LaunchListItemDto) =>
  productName ?? t("history.launches.noProduct");

const adsSummary = ({ itemsDone, itemsFailed }: LaunchListItemDto) =>
  `${itemsDone} ${t("history.launches.adsOk")} · ${itemsFailed} ${t("history.launches.adsError")}`;

export function LaunchesTable({
  workspaceId,
  launches,
  loading,
  error,
  onRetry,
  onActivate,
}: LaunchesTableProps) {
  const columns: Column<LaunchListItemDto>[] = [
    {
      key: "date",
      header: t("history.launches.colDate"),
      rowHeader: true,
      render: (launch) => (
        <Link
          to={workspacePath(workspaceId, `lanzador/${launch.id}`)}
          className="text-primary underline"
        >
          {new Date(launch.createdAt).toLocaleString("es-AR")}
        </Link>
      ),
    },
    {
      key: "product",
      header: t("history.launches.colProduct"),
      render: productName,
    },
    {
      key: "account",
      header: t("history.launches.colAccount"),
      render: ({ adAccountName }) => adAccountName ?? "—",
    },
    {
      key: "ads",
      header: t("history.launches.colAds"),
      render: adsSummary,
    },
    {
      key: "status",
      header: t("history.launches.colStatus"),
      render: ({ status }) => (
        <StatusChip tone={launchStatusTone(status)}>
          {statusLabel(status)}
        </StatusChip>
      ),
    },
    {
      key: "actions",
      header: t("history.launches.colActions"),
      render: (launch) =>
        canActivateFromHistory(launch.status) && (
          <Button
            aria-label={`${t("history.launches.activate")} ${productName(launch)}`}
            onClick={() => onActivate(launch)}
          >
            {t("history.launches.activate")}
          </Button>
        ),
    },
  ];

  return (
    <DataTable
      caption={t("history.launches.caption")}
      columns={columns}
      rows={launches}
      getRowKey={({ id }) => id}
      loading={loading}
      error={error ? t("history.loadError") : undefined}
      onRetry={onRetry}
      empty={t("history.launches.empty")}
    />
  );
}
