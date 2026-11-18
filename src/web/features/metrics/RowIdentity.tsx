import type { MetricsRowDto } from "../../../shared/schemas/metrics";
import { StatusChip, type StatusTone } from "../../components/Chip";
import { t } from "../../i18n/es-AR";

const STATUS_STYLE: Record<string, { tone: StatusTone; label: string }> = {
  ACTIVE: { tone: "ready", label: t("metrics.status.ACTIVE") },
  PAUSED: { tone: "paused", label: t("metrics.status.PAUSED") },
};

export function RowIdentity({
  name,
  status,
  protected: locked,
}: MetricsRowDto) {
  const style = status
    ? (STATUS_STYLE[status] ?? {
        tone: "warn",
        label: t("metrics.status.other"),
      })
    : null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{name}</span>
      {style && <StatusChip tone={style.tone}>{style.label}</StatusChip>}
      {locked && (
        <span>
          <span aria-hidden="true">🔒</span>
          <span className="sr-only">{t("metrics.protected")}</span>
        </span>
      )}
    </span>
  );
}
