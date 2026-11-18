import type { ConnectionDto } from "../../../shared/schemas/meta-connections";
import type { StatusTone } from "../../components/Chip";
import { t } from "../../i18n/es-AR";

const DAY_MS = 86_400_000;
const EXPIRY_WARNING_DAYS = 7;

const dateFormat = new Intl.DateTimeFormat("es-AR", { dateStyle: "long" });

const daysUntil = (isoDate: string, nowMs: number) =>
  Math.max(1, Math.ceil((Date.parse(isoDate) - nowMs) / DAY_MS));

export function connectionStatus(
  { status, tokenExpiresAt }: ConnectionDto,
  nowMs = Date.now(),
): { tone: StatusTone; label: string } {
  if (status === "reconnect_required")
    return { tone: "error", label: t("connections.statusReconnect") };
  const days = tokenExpiresAt ? daysUntil(tokenExpiresAt, nowMs) : null;
  if (days !== null && days <= EXPIRY_WARNING_DAYS) {
    const unit = t(days === 1 ? "connections.day" : "connections.days");
    return {
      tone: "warn",
      label: `${t("connections.expiresIn")} ${days} ${unit}`,
    };
  }
  return { tone: "ready", label: t("connections.statusActive") };
}

export const expiryDate = (isoDate: string) =>
  `${t("connections.expiresOn")} ${dateFormat.format(new Date(isoDate))}`;
