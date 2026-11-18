import type { ComponentType } from "react";
import type { MetricsFilters } from "../../features/metrics/metrics-filters";
import type { MetricsOptions } from "../../features/metrics/use-metrics-options";
import type { TextKey } from "../../i18n/es-AR";
import PerformanceTab from "./PerformanceTab";

export type MetricsTabProps = {
  workspaceId: string;
  filters: MetricsFilters;
  options: MetricsOptions;
  onFiltersChange: (patch: Partial<MetricsFilters>) => void;
};

export type MetricsTab = {
  id: string;
  label: TextKey;
  panel: ComponentType<MetricsTabProps>;
};

export const METRICS_TABS: [MetricsTab, ...MetricsTab[]] = [
  {
    id: "rendimiento",
    label: "metrics.tabs.performance",
    panel: PerformanceTab,
  },
];
