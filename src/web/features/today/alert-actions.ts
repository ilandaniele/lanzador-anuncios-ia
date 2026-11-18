import type { TodayAlertDto } from "../../../shared/schemas/today";
import type { TextKey } from "../../i18n/es-AR";

type AlertAction = { label: TextKey; section: (objectId: string) => string };

const CONNECTIONS = "ajustes/conexiones";

const ALERT_ACTIONS: Record<TodayAlertDto["kind"], AlertAction> = {
  reconnect_required: {
    label: "hoy.reconnectMeta",
    section: () => CONNECTIONS,
  },
  token_expiring: { label: "hoy.reconnectMeta", section: () => CONNECTIONS },
  account_problem: { label: "hoy.viewAccounts", section: () => CONNECTIONS },
  ads_rejected: { label: "hoy.viewRejectedAds", section: () => "metricas" },
  launch_failed: {
    label: "hoy.viewLaunch",
    section: (objectId) => `lanzador/${objectId}`,
  },
};

export const alertAction = ({ kind }: TodayAlertDto) => ALERT_ACTIONS[kind];

export const sortBySeverity = (alerts: TodayAlertDto[]) =>
  [...alerts].sort(
    (a, b) => Number(b.severity === "error") - Number(a.severity === "error"),
  );
