import type { MetricsRowDto } from "../../../shared/schemas/metrics";
import { formatMetric, type MetricKey } from "./metric-format";
import { RoasValue } from "./RoasValue";

type MetricValueProps = {
  row: MetricsRowDto;
  metric: MetricKey;
  breakEvenById: ReadonlyMap<string, number | null>;
};

export function MetricValue({ row, metric, breakEvenById }: MetricValueProps) {
  if (metric === "roas")
    return (
      <RoasValue
        roas={row.roas}
        breakEvenRoas={
          row.productId ? breakEvenById.get(row.productId) : undefined
        }
      />
    );
  return formatMetric(metric, row[metric], row.currency);
}
