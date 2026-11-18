import type { MetricsRowDto } from "../../../shared/schemas/metrics";
import { Button } from "../../components/Button";
import { DataTable, type Column, type Sort } from "../../components/DataTable";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import {
  METRICS,
  TABLE_METRIC_KEYS,
} from "../../features/metrics/metric-format";
import { MetricValue } from "../../features/metrics/MetricValue";
import { RowIdentity } from "../../features/metrics/RowIdentity";
import { t } from "../../i18n/es-AR";

const LIST_SKELETON_ROWS = 8;
const LIST_METRIC_KEYS = ["spendMinor", "roas", "cpaMinor"] as const;

type MetricsViewProps = {
  caption: string;
  rows: MetricsRowDto[];
  breakEvenById: ReadonlyMap<string, number | null>;
  loading: boolean;
  updating: boolean;
  error?: string;
  onRetry: () => void;
};

type MetricsTableProps = MetricsViewProps & {
  sort: Sort;
  onSortChange: (sort: Sort | null) => void;
};

export function MetricsTable({
  breakEvenById,
  sort,
  onSortChange,
  ...view
}: MetricsTableProps) {
  const columns: Column<MetricsRowDto>[] = [
    {
      key: "name",
      header: t("metrics.col.name"),
      rowHeader: true,
      sortable: true,
      render: (row) => <RowIdentity {...row} />,
    },
    ...TABLE_METRIC_KEYS.map((metric): Column<MetricsRowDto> => ({
      key: metric,
      header: t(METRICS[metric].label),
      numeric: true,
      sortable: true,
      render: (row) => (
        <MetricValue row={row} metric={metric} breakEvenById={breakEvenById} />
      ),
    })),
  ];

  return (
    <DataTable
      caption={view.caption}
      columns={columns}
      rows={view.rows}
      getRowKey={({ id }) => id}
      sort={sort}
      onSortChange={onSortChange}
      loading={view.loading}
      updating={view.updating}
      error={view.error}
      onRetry={view.onRetry}
      empty={t("metrics.empty")}
    />
  );
}

export function MetricsList({
  caption,
  rows,
  breakEvenById,
  loading,
  updating,
  error,
  onRetry,
}: MetricsViewProps) {
  if (loading)
    return (
      <SkeletonRegion label={t("metrics.loading")}>
        {Array.from({ length: LIST_SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="my-4 h-10" />
        ))}
      </SkeletonRegion>
    );
  if (error)
    return (
      <div className="flex flex-col items-center gap-2 py-6">
        <p role="alert" className="text-loss">
          {error}
        </p>
        <Button variant="secondary" onClick={onRetry}>
          {t("errors.retry")}
        </Button>
      </div>
    );
  if (rows.length === 0)
    return (
      <p className="py-6 text-center text-ink-muted">{t("metrics.empty")}</p>
    );

  return (
    <ul
      aria-label={caption}
      aria-busy={updating || undefined}
      className="divide-y divide-rule border-y border-rule"
    >
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-2 py-3">
          <RowIdentity {...row} />
          <dl className="grid grid-cols-3 gap-2 tabular-nums">
            {LIST_METRIC_KEYS.map((metric) => (
              <div key={metric}>
                <dt className="text-sm text-ink-muted">
                  {t(METRICS[metric].label)}
                </dt>
                <dd>
                  <MetricValue
                    row={row}
                    metric={metric}
                    breakEvenById={breakEvenById}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}
