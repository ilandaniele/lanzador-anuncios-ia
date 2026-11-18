import type { AdminUsageDto } from "../../../shared/schemas/admin";
import { DataTable, type Column } from "../../components/DataTable";
import { t } from "../../i18n/es-AR";

type UsageRow = AdminUsageDto["workspaces"][number];

type UsageTableProps = {
  workspaces: UsageRow[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

const formatCount = (count: number) => count.toLocaleString("es-AR");

const COLUMNS: Column<UsageRow>[] = [
  {
    key: "name",
    header: t("adminUsage.colName"),
    render: ({ name }) => name,
    rowHeader: true,
  },
  {
    key: "neurons",
    header: t("adminUsage.colNeurons"),
    render: ({ neurons }) => formatCount(neurons),
    numeric: true,
  },
  {
    key: "metaCalls",
    header: t("adminUsage.colMetaCalls"),
    render: ({ metaCalls }) => formatCount(metaCalls),
    numeric: true,
  },
];

export const UsageTable = ({
  workspaces,
  loading,
  error,
  onRetry,
}: UsageTableProps) => (
  <DataTable
    caption={t("adminUsage.caption")}
    columns={COLUMNS}
    rows={workspaces}
    getRowKey={({ id }) => id}
    loading={loading}
    error={error ? t("adminUsage.loadError") : undefined}
    onRetry={onRetry}
    empty={t("adminUsage.empty")}
  />
);
