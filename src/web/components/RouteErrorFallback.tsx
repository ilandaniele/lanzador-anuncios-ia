import { useEffect } from "react";
import { useRouteError } from "react-router";
import { t } from "../i18n/es-AR";
import { reportError } from "../lib/report-error";

export function RouteErrorFallback() {
  const error = useRouteError();
  useEffect(() => reportError(error), [error]);

  return (
    <main role="alert">
      <p>{t("errors.generic")}</p>
      <button type="button" onClick={() => window.location.reload()}>
        {t("errors.reload")}
      </button>
    </main>
  );
}
