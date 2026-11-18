import { t } from "../../i18n/es-AR";
import { RefreshControl } from "./RefreshControl";

const timeFormat = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
});

type TodayHeaderProps = {
  workspaceId: string;
  updatedAt: string | null | undefined;
  stale: boolean;
};

export function TodayHeader({
  workspaceId,
  updatedAt,
  stale,
}: TodayHeaderProps) {
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{t("nav.hoy")}</h1>
      <div className="flex items-center gap-3">
        {updatedAt && (
          <p className="text-sm text-ink-muted">
            {t("hoy.updatedAt")} {timeFormat.format(new Date(updatedAt))}
            {stale && ` · ${t("hoy.stale")}`}
          </p>
        )}
        <RefreshControl workspaceId={workspaceId} />
      </div>
    </header>
  );
}
