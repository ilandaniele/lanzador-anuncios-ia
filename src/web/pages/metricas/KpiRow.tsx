import type { MetricsTotalsDto } from "../../../shared/schemas/metrics";
import { Skeleton } from "../../components/Skeleton";
import { Delta } from "../../features/metrics/Delta";
import {
  formatMetric,
  KPI_KEYS,
  METRICS,
  NO_VALUE,
} from "../../features/metrics/metric-format";
import { t } from "../../i18n/es-AR";

const timeFormat = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export type UpdateInfo = { updatedAt: string | null; stale: boolean };

type KpiRowProps = {
  totals?: MetricsTotalsDto;
  previous?: MetricsTotalsDto;
  loading: boolean;
  currencyLabel?: string;
  update?: UpdateInfo;
};

function updatedText({ updatedAt, stale }: UpdateInfo): string {
  const time = updatedAt ? timeFormat.format(new Date(updatedAt)) : NO_VALUE;
  const suffix = stale ? ` · ${t("metrics.stale")}` : "";
  return `${t("metrics.updatedAt")} ${time}${suffix}`;
}

export function KpiRow({
  totals,
  previous,
  loading,
  currencyLabel,
  update,
}: KpiRowProps) {
  const label = currencyLabel
    ? `${t("metrics.summary")} ${currencyLabel}`
    : t("metrics.summary");

  return (
    <section
      aria-label={label}
      className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-6"
    >
      <dl className="contents">
        {KPI_KEYS.map((key) => (
          <div key={key}>
            <dt className="text-sm text-ink-muted">{t(METRICS[key].label)}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {loading ? (
                <Skeleton className="h-6 w-20" />
              ) : (
                <>
                  {formatMetric(
                    key,
                    totals?.[key] ?? null,
                    totals?.currency ?? "",
                  )}
                  <Delta
                    sense={METRICS[key].sense}
                    current={totals?.[key] ?? null}
                    previous={previous?.[key] ?? null}
                  />
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {update && !loading && (
        <p className="self-center text-sm text-ink-muted">
          {updatedText(update)}
        </p>
      )}
    </section>
  );
}
