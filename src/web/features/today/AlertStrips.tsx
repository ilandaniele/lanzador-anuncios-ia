import { Link } from "react-router";
import type { TodayAlertDto } from "../../../shared/schemas/today";
import { buttonClass } from "../../components/Button";
import { cx } from "../../components/classes";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";
import { alertAction, sortBySeverity } from "./alert-actions";

const severityStyle = {
  error: { icon: "✕", label: "hoy.severityError", className: "bg-loss-soft" },
  warn: { icon: "!", label: "hoy.severityWarn", className: "bg-warn-soft" },
} as const;

type AlertStripsProps = { workspaceId: string; alerts: TodayAlertDto[] };

export function AlertStrips({ workspaceId, alerts }: AlertStripsProps) {
  if (alerts.length === 0) return null;
  return (
    <section aria-labelledby="hoy-alerts-title" className="lg:col-span-2">
      <h2 id="hoy-alerts-title" className="sr-only">
        {t("hoy.alertsTitle")}
      </h2>
      <ul className="flex flex-col gap-2">
        {sortBySeverity(alerts).map((alert) => {
          const { icon, label, className } = severityStyle[alert.severity];
          const { label: actionLabel, section } = alertAction(alert);
          return (
            <li
              key={`${alert.kind}-${alert.objectId}`}
              className={cx(
                "flex flex-wrap items-center justify-between gap-3 rounded-sm px-4 py-3",
                className,
              )}
            >
              <p>
                <span aria-hidden="true">{icon} </span>
                <span className="sr-only">{t(label)} </span>
                {alert.text}
              </p>
              <Link
                to={workspacePath(workspaceId, section(alert.objectId))}
                className={buttonClass("secondary")}
              >
                {t(actionLabel)}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
