import { useState } from "react";
import {
  TAG_DIMENSIONS,
  type TagDimension,
  type WinningTagDto,
} from "../../../shared/schemas/metrics";
import { DataTable, type Column } from "../../components/DataTable";
import { SegmentedControl } from "../../components/SegmentedControl";
import { rangeText } from "../../features/metrics/filter-caption";
import { formatMetric } from "../../features/metrics/metric-format";
import { isRangeComplete } from "../../features/metrics/metrics-filters";
import { RoasBar } from "../../features/metrics/RoasBar";
import { tagLabel } from "../../features/metrics/tag-label";
import { useWinningTags } from "../../features/metrics/use-winning-tags";
import { t } from "../../i18n/es-AR";
import type { MetricsTabProps } from "./tabs";

const dimensionOptions = TAG_DIMENSIONS.map((value) => ({
  value,
  label: t(`metrics.winning.dimension.${value}`),
}));

export default function WinningTagsTab({
  workspaceId,
  filters,
  options,
}: MetricsTabProps) {
  const [dimension, setDimension] = useState<TagDimension>(TAG_DIMENSIONS[0]);
  const winning = useWinningTags(workspaceId, filters, dimension);

  if (!isRangeComplete(filters))
    return <p className="text-ink-muted">{t("metrics.customHint")}</p>;

  const rows = winning.data?.data ?? [];
  const scaleMax = Math.max(...rows.map(({ roas }) => roas ?? 0));
  const breakEvenRoas = options.products.breakEvenById.get(filters.productId);

  const columns: Column<WinningTagDto>[] = [
    {
      key: "tag",
      header: t("metrics.winning.col.tag"),
      rowHeader: true,
      render: (row) => tagLabel(dimension, row.tag),
    },
    {
      key: "ads",
      header: t("metrics.winning.col.ads"),
      numeric: true,
      render: (row) => row.ads,
    },
    {
      key: "spendMinor",
      header: t("metrics.col.spendMinor"),
      numeric: true,
      render: (row) => formatMetric("spendMinor", row.spendMinor, row.currency),
    },
    {
      key: "roas",
      header: t("metrics.col.roas"),
      numeric: true,
      render: (row) => (
        <RoasBar
          roas={row.roas}
          scaleMax={scaleMax}
          breakEvenRoas={breakEvenRoas}
        />
      ),
    },
    {
      key: "cpaMinor",
      header: t("metrics.col.cpaMinor"),
      numeric: true,
      render: (row) => formatMetric("cpaMinor", row.cpaMinor, row.currency),
    },
  ];

  return (
    <>
      <div className="mb-4">
        <SegmentedControl
          legend={t("metrics.winning.dimensionLegend")}
          options={dimensionOptions}
          value={dimension}
          onChange={setDimension}
        />
      </div>
      <DataTable
        caption={`${t("metrics.winning.captionIntro")} ${t(`metrics.winning.dimension.${dimension}`).toLowerCase()}. ${t("metrics.captionRange")}: ${rangeText(filters)}.`}
        columns={columns}
        rows={rows}
        getRowKey={({ tag, currency }) => `${tag}-${currency}`}
        loading={winning.isPending}
        error={winning.isError ? t("metrics.winning.loadError") : undefined}
        onRetry={() => void winning.refetch()}
        empty={t("metrics.winning.empty")}
      />
    </>
  );
}
