import { t } from "../../i18n/es-AR";

export function UsedIn({ count }: { count: number }) {
  const unit = t(count === 1 ? "creatives.launchOne" : "creatives.launchMany");
  return (
    <span className="text-sm text-ink-muted">
      {`${t("creatives.usedIn")} ${count} ${unit}`}
    </span>
  );
}
