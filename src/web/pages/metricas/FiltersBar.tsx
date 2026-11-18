import { METRICS_LEVELS } from "../../../shared/schemas/metrics";
import { Combobox } from "../../components/Combobox";
import { SegmentedControl } from "../../components/SegmentedControl";
import { Select } from "../../components/Select";
import { Input } from "../../components/TextField";
import { comparisonLabel } from "../../features/metrics/comparison";
import {
  RANGE_OPTIONS,
  type MetricsFilters,
} from "../../features/metrics/metrics-filters";
import type { MetricsOptions } from "../../features/metrics/use-metrics-options";
import { t } from "../../i18n/es-AR";

const rangeOptions = RANGE_OPTIONS.map((value) => ({
  value,
  label: t(`metrics.ranges.${value}`),
}));

const levelOptions = METRICS_LEVELS.map((value) => ({
  value,
  label: t(`metrics.levels.${value}`),
}));

type FiltersBarProps = {
  filters: MetricsFilters;
  options: MetricsOptions;
  onChange: (patch: Partial<MetricsFilters>) => void;
};

export function FiltersBar({ filters, options, onChange }: FiltersBarProps) {
  const comparison = comparisonLabel(filters);

  return (
    <section
      aria-label={t("metrics.filtersLabel")}
      className="sticky top-0 z-10 mb-4 flex flex-wrap items-end gap-4 bg-paper py-3"
    >
      <Select
        label={t("metrics.range")}
        value={filters.range}
        options={rangeOptions}
        onChange={(event) =>
          onChange({ range: event.target.value as MetricsFilters["range"] })
        }
      />
      {filters.range === "custom" && (
        <>
          <Input
            type="date"
            label={t("metrics.from")}
            value={filters.from}
            onChange={(event) => onChange({ from: event.target.value })}
          />
          <Input
            type="date"
            label={t("metrics.to")}
            value={filters.to}
            onChange={(event) => onChange({ to: event.target.value })}
          />
        </>
      )}
      <div className="min-w-48">
        <Combobox
          {...options.accounts.state}
          label={t("metrics.account")}
          options={options.accounts.options}
          value={filters.adAccountId}
          onChange={(adAccountId) => onChange({ adAccountId })}
        />
      </div>
      <div className="min-w-48">
        <Combobox
          {...options.products.state}
          label={t("metrics.product")}
          options={options.products.options}
          value={filters.productId}
          onChange={(productId) => onChange({ productId })}
        />
      </div>
      <SegmentedControl
        legend={t("metrics.level")}
        options={levelOptions}
        value={filters.level}
        onChange={(level) => onChange({ level })}
      />
      {comparison && (
        <span className="rounded-xs border border-rule-strong bg-surface px-2 py-0.5 text-sm text-ink-muted">
          {`${t("metrics.comparing")} ${comparison}`}
        </span>
      )}
    </section>
  );
}
