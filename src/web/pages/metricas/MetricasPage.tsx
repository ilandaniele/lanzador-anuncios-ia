import { useNavigate, useParams, useSearchParams } from "react-router";
import { buttonClass, Button } from "../../components/Button";
import { cx, focusRing } from "../../components/classes";
import { EmptyState } from "../../components/EmptyState";
import {
  applyFilters,
  isRangeComplete,
  parseFilters,
  type MetricsFilters,
} from "../../features/metrics/metrics-filters";
import { exportCsvUrl } from "../../features/metrics/use-metrics";
import { useMetricsOptions } from "../../features/metrics/use-metrics-options";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";
import { FiltersBar } from "./FiltersBar";
import { METRICS_TABS } from "./tabs";

const TAB_PARAM = "tab";

export default function MetricasPage() {
  const { workspaceId = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const options = useMetricsOptions(workspaceId);
  const filters = parseFilters(params);
  const activeTab =
    METRICS_TABS.find(({ id }) => id === params.get(TAB_PARAM)) ??
    METRICS_TABS[0];
  const Panel = activeTab.panel;

  const updateFilters = (patch: Partial<MetricsFilters>) =>
    setParams(
      (current) =>
        applyFilters(current, { ...parseFilters(current), ...patch }),
      { replace: true },
    );

  const selectTab = (id: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set(TAB_PARAM, id);
        return next;
      },
      { replace: true },
    );

  if (options.hasNoAccounts)
    return (
      <EmptyState
        message={t("metrics.noAccounts")}
        action={
          <Button
            onClick={() =>
              navigate(workspacePath(workspaceId, "ajustes/conexiones"))
            }
          >
            {t("metrics.connect")}
          </Button>
        }
      />
    );

  return (
    <section aria-labelledby="metricas-titulo">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 id="metricas-titulo" className="text-xl font-semibold">
          {t("nav.metricas")}
        </h1>
        {isRangeComplete(filters) && (
          <a
            href={exportCsvUrl(workspaceId, filters)}
            download
            className={buttonClass("secondary")}
          >
            {t("metrics.exportCsv")}
          </a>
        )}
      </div>
      <FiltersBar
        filters={filters}
        options={options}
        onChange={updateFilters}
      />
      <div
        role="tablist"
        aria-label={t("metrics.tabsLabel")}
        className="mb-4 flex gap-4 border-b border-rule"
      >
        {METRICS_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`metricas-tab-${id}`}
            aria-selected={id === activeTab.id}
            aria-controls="metricas-panel"
            tabIndex={id === activeTab.id ? 0 : -1}
            onClick={() => selectTab(id)}
            className={cx(
              "min-h-10 border-b-2 px-1",
              id === activeTab.id
                ? "border-primary font-semibold"
                : "border-transparent text-ink-muted",
              focusRing,
            )}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="metricas-panel"
        aria-labelledby={`metricas-tab-${activeTab.id}`}
      >
        <Panel
          workspaceId={workspaceId}
          filters={filters}
          options={options}
          onFiltersChange={updateFilters}
        />
      </div>
    </section>
  );
}
