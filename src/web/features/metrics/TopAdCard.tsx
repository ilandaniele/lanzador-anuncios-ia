import type { TopAdDto } from "../../../shared/schemas/metrics";
import { cx } from "../../components/classes";
import { t } from "../../i18n/es-AR";
import { formatRoas } from "../../lib/format-roas";
import { formatMoney } from "../../lib/money";
import { Thumbnail } from "../launch/Thumbnail";

type TopAdCardProps = {
  ad: TopAdDto;
  selectable: boolean;
  chosen: boolean;
  blocked: boolean;
  onToggle: () => void;
};

export function TopAdCard({
  ad,
  selectable,
  chosen,
  blocked,
  onToggle,
}: TopAdCardProps) {
  return (
    <li>
      <label
        className={cx(
          "flex h-full flex-col gap-2 rounded-sm border border-rule-strong bg-surface p-3",
          chosen && "border-primary bg-primary-soft",
          blocked ? "opacity-60" : selectable && "cursor-pointer",
        )}
      >
        <Thumbnail url={ad.thumbnailUrl} className="aspect-square w-full" />
        <span className="flex items-start gap-2">
          {selectable && (
            <input
              type="checkbox"
              aria-label={`${t("metrics.topAds.choose")} ${ad.name}`}
              checked={chosen}
              disabled={blocked}
              onChange={onToggle}
              className="mt-1"
            />
          )}
          <span className="min-w-0 flex-1 font-medium">{ad.name}</span>
        </span>
        <span className="text-2xl font-semibold tabular-nums">
          <span className="sr-only">{t("metrics.roasLabel")} </span>
          {ad.roas === null ? t("metrics.topAds.noRoas") : formatRoas(ad.roas)}
        </span>
        <span className="text-sm tabular-nums text-ink-muted">
          {t("metrics.topAds.spend")} {formatMoney(ad.spendMinor, ad.currency)}
        </span>
        {blocked && (
          <span className="text-sm text-ink-muted">
            {t("metrics.topAds.otherAccount")}
          </span>
        )}
      </label>
    </li>
  );
}
