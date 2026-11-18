import type { AdminErrorDto } from "../../../shared/schemas/admin";
import { DataTable, type Column } from "../../components/DataTable";
import { t } from "../../i18n/es-AR";
import { formatLastActivity } from "./format-last-activity";

type ErrorsTableProps = {
  errors: AdminErrorDto[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

const orDash = (value: string | null) => value ?? "—";
const statusAndCode = ({ status, code }: AdminErrorDto) =>
  [status, code].filter((part) => part !== null).join(" ") || "—";

const COLUMNS: Column<AdminErrorDto>[] = [
  {
    key: "createdAt",
    header: t("adminErrors.colDate"),
    render: ({ createdAt }) => formatLastActivity(createdAt),
    rowHeader: true,
  },
  {
    key: "source",
    header: t("adminErrors.colSource"),
    render: ({ source }) => t(`adminErrors.source.${source}`),
  },
  {
    key: "route",
    header: t("adminErrors.colRoute"),
    render: ({ route }) => orDash(route),
  },
  {
    key: "status",
    header: t("adminErrors.colStatus"),
    render: statusAndCode,
  },
  {
    key: "message",
    header: t("adminErrors.colMessage"),
    render: ({ message, requestId }) => (
      <>
        <span className="block break-words">{message}</span>
        {requestId && <span className="block text-ink-muted">{requestId}</span>}
      </>
    ),
  },
];

export const ErrorsTable = ({
  errors,
  loading,
  error,
  onRetry,
}: ErrorsTableProps) => (
  <DataTable
    caption={t("adminErrors.caption")}
    columns={COLUMNS}
    rows={errors}
    getRowKey={({ id }) => id}
    loading={loading}
    error={error ? t("adminErrors.loadError") : undefined}
    onRetry={onRetry}
    empty={t("adminErrors.empty")}
  />
);
