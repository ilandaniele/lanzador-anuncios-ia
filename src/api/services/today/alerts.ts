import {
  TODAY_ALERT_KINDS,
  TODAY_ALERT_SEVERITIES,
  type TodayAlertDto,
} from "../../../shared/schemas/today";
import type { TodayRows } from "../../repositories/today";
import { isEligibleAccountStatus } from "../launch/account-check";
import type { AccountView } from "./insights";

const REJECTED_STATUS = "DISAPPROVED";

const isoDay = (at: number) => new Date(at).toISOString().slice(0, 10);

const connectionName = ({ businessName }: { businessName: string | null }) =>
  businessName ?? "Meta";

function connectionAlerts(
  connections: TodayRows["connections"],
  at: number,
): TodayAlertDto[] {
  return connections.map((connection): TodayAlertDto => {
    if (connection.status === "reconnect_required") {
      return {
        kind: "reconnect_required",
        severity: "error",
        text: `Reconectá ${connectionName(connection)}: la conexión con Meta venció`,
        objectId: connection.id,
      };
    }
    const expiresAt = connection.tokenExpiresAt ?? at;
    return {
      kind: "token_expiring",
      severity: "warn",
      text: `El acceso de ${connectionName(connection)} ${expiresAt <= at ? "venció" : "vence"} el ${isoDay(expiresAt)}`,
      objectId: connection.id,
    };
  });
}

const accountProblem = ({ account, health }: AccountView): TodayAlertDto[] =>
  health && !isEligibleAccountStatus(health.accountStatus)
    ? [
        {
          kind: "account_problem",
          severity: "error",
          text: `La cuenta ${account.name} tiene problemas (estado ${health.accountStatus})`,
          objectId: account.id,
        },
      ]
    : [];

function rejectedAds({ account, issues }: AccountView): TodayAlertDto[] {
  const rejected = issues.filter(
    ({ effectiveStatus }) => effectiveStatus === REJECTED_STATUS,
  ).length;
  if (rejected === 0) return [];
  return [
    {
      kind: "ads_rejected",
      severity: "error",
      text: `${rejected} ${rejected === 1 ? "anuncio rechazado" : "anuncios rechazados"} en ${account.name}`,
      objectId: account.id,
    },
  ];
}

const accountAlerts = (views: AccountView[]) =>
  views.flatMap((view) => [...accountProblem(view), ...rejectedAds(view)]);

const launchAlerts = (launchErrors: TodayRows["launchErrors"]) =>
  launchErrors.map(({ id, status, campaignName }): TodayAlertDto => ({
    kind: "launch_failed",
    severity: status === "failed" ? "error" : "warn",
    text:
      status === "failed"
        ? `El lanzamiento ${campaignName ?? id} falló`
        : `El lanzamiento ${campaignName ?? id} terminó con errores`,
    objectId: id,
  }));

const rank = ({ severity, kind }: TodayAlertDto) =>
  TODAY_ALERT_SEVERITIES.indexOf(severity) * TODAY_ALERT_KINDS.length +
  TODAY_ALERT_KINDS.indexOf(kind);

export const buildAlerts = (
  { connections, launchErrors }: TodayRows,
  views: AccountView[],
  at: number,
): TodayAlertDto[] =>
  [
    ...connectionAlerts(connections, at),
    ...accountAlerts(views),
    ...launchAlerts(launchErrors),
  ].sort((a, b) => rank(a) - rank(b));
