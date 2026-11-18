import { formatMoney } from "../../lib/money";
import { formatRoas } from "../../lib/format-roas";
import type { TextKey } from "../../i18n/es-AR";
import type { DeltaSense } from "./compute-delta";

export const NO_VALUE = "—";

export type MetricKey =
  | "spendMinor"
  | "purchases"
  | "purchaseValueMinor"
  | "roas"
  | "cpaMinor"
  | "ctr"
  | "cpmMinor";

export const KPI_KEYS = [
  "spendMinor",
  "purchases",
  "purchaseValueMinor",
  "roas",
  "cpaMinor",
] as const satisfies readonly MetricKey[];

export const TABLE_METRIC_KEYS = [
  ...KPI_KEYS,
  "ctr",
  "cpmMinor",
] as const satisfies readonly MetricKey[];

type MetricDefinition = {
  label: TextKey;
  sense: DeltaSense;
  format: (value: number, currency: string) => string;
};

const money = (value: number, currency: string) => formatMoney(value, currency);

export const METRICS: Record<MetricKey, MetricDefinition> = {
  spendMinor: {
    label: "metrics.col.spendMinor",
    sense: "neutral",
    format: money,
  },
  purchases: {
    label: "metrics.col.purchases",
    sense: "higherIsBetter",
    format: (value) => new Intl.NumberFormat("es-AR").format(value),
  },
  purchaseValueMinor: {
    label: "metrics.col.purchaseValueMinor",
    sense: "higherIsBetter",
    format: money,
  },
  roas: {
    label: "metrics.col.roas",
    sense: "higherIsBetter",
    format: formatRoas,
  },
  cpaMinor: {
    label: "metrics.col.cpaMinor",
    sense: "lowerIsBetter",
    format: money,
  },
  ctr: {
    label: "metrics.col.ctr",
    sense: "higherIsBetter",
    format: (value) => `${formatRoas(value)} %`,
  },
  cpmMinor: {
    label: "metrics.col.cpmMinor",
    sense: "lowerIsBetter",
    format: money,
  },
};

export function formatMetric(
  key: MetricKey,
  value: number | null,
  currency: string,
): string {
  return value === null ? NO_VALUE : METRICS[key].format(value, currency);
}

type SignDisplay = "exceptZero" | "never";

const percentFormat = (fractionDigits: number, signDisplay: SignDisplay) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 1,
    signDisplay,
  });

export const formatPercent = (
  percent: number,
  signDisplay: SignDisplay = "exceptZero",
) => `${percentFormat(1, signDisplay).format(percent)} %`;

export const formatPercentPlain = (percent: number) =>
  `${percentFormat(0, "never").format(percent)} %`;
