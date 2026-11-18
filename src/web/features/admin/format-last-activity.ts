import { t } from "../../i18n/es-AR";

const formatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Argentina/Buenos_Aires",
});

export const formatLastActivity = (iso: string | null): string =>
  iso === null ? t("admin.neverUsed") : formatter.format(new Date(iso));
