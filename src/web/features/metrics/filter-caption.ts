import { t } from "../../i18n/es-AR";
import type { MetricsFilters } from "./metrics-filters";

const dayMonthYear = (day: string) => day.split("-").reverse().join("/");

function rangeText({ range, from, to }: MetricsFilters): string {
  const label = t(`metrics.ranges.${range}`);
  if (range !== "custom" || !from || !to) return label;
  return `${label}, ${t("metrics.captionDates")} ${dayMonthYear(from)} ${t("metrics.captionDatesTo")} ${dayMonthYear(to)}`;
}

type CaptionNames = { account?: string; product?: string };

export function filterCaption(
  filters: MetricsFilters,
  { account, product }: CaptionNames,
): string {
  return (
    [
      `${t("metrics.captionIntro")} ${t(`metrics.levelPlural.${filters.level}`)}`,
      `${t("metrics.captionRange")}: ${rangeText(filters)}`,
      `${t("metrics.captionAccount")}: ${account ?? t("metrics.allAccounts")}`,
      `${t("metrics.captionProduct")}: ${product ?? t("metrics.allProducts")}`,
    ].join(". ") + "."
  );
}
