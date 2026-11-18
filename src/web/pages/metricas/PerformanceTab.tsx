import { Button } from "../../components/Button";
import { ToastProvider } from "../../components/Toast";
import { filterCaption } from "../../features/metrics/filter-caption";
import {
  DEFAULT_SORT,
  isRangeComplete,
} from "../../features/metrics/metrics-filters";
import { useMetrics } from "../../features/metrics/use-metrics";
import { optionLabel } from "../../features/metrics/use-metrics-options";
import { t } from "../../i18n/es-AR";
import { ApiError } from "../../lib/api";
import { useMediaQuery } from "../../lib/use-media-query";
import { KpiRow } from "./KpiRow";
import { MetricsList, MetricsTable } from "./MetricsTable";
import type { MetricsTabProps } from "./tabs";

const MOBILE_QUERY = "(max-width: 767px)";

function errorMessage(error: Error | null): string | undefined {
  if (!error) return undefined;
  return error instanceof ApiError && error.code === "RANGE_INVALID"
    ? t("metrics.rangeInvalid")
    : t("metrics.loadError");
}

export default function PerformanceTab({
  workspaceId,
  filters,
  options,
  onFiltersChange,
}: MetricsTabProps) {
  const metrics = useMetrics(workspaceId, filters);
  const isMobile = useMediaQuery(MOBILE_QUERY);

  if (!isRangeComplete(filters))
    return <p className="text-ink-muted">{t("metrics.customHint")}</p>;

  const first = metrics.data?.pages[0];
  const totals = first?.totals.length ? first.totals : [undefined];
  const view = {
    workspaceId,
    caption: filterCaption(filters, {
      account: optionLabel(options.accounts.options, filters.adAccountId),
      product: optionLabel(options.products.options, filters.productId),
    }),
    rows: metrics.data?.pages.flatMap((page) => page.data) ?? [],
    breakEvenById: options.products.breakEvenById,
    loading: metrics.isPending,
    updating: metrics.isFetching && !metrics.isPending,
    error: errorMessage(metrics.error),
    onRetry: () => void metrics.refetch(),
  };

  return (
    <ToastProvider>
      {!view.error &&
        totals.map((current, index) => (
          <KpiRow
            key={current?.currency ?? ""}
            totals={current}
            previous={first?.previousTotals.find(
              ({ currency }) => currency === current?.currency,
            )}
            loading={view.loading}
            currencyLabel={totals.length > 1 ? current?.currency : undefined}
            update={
              index === 0 && first
                ? { updatedAt: first.updatedAt, stale: first.stale }
                : undefined
            }
          />
        ))}
      {isMobile ? (
        <MetricsList {...view} />
      ) : (
        <MetricsTable
          {...view}
          sort={filters.sort ?? DEFAULT_SORT}
          onSortChange={(sort) => onFiltersChange({ sort })}
        />
      )}
      {metrics.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            loading={metrics.isFetchingNextPage}
            loadingLabel={t("common.working")}
            onClick={() => void metrics.fetchNextPage()}
          >
            {t("metrics.loadMore")}
          </Button>
        </div>
      )}
    </ToastProvider>
  );
}
