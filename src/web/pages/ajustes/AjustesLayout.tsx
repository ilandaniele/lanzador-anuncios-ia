import { Outlet } from "react-router";
import { t } from "../../i18n/es-AR";

export default function AjustesLayout() {
  return (
    <main>
      <h1>{t("nav.ajustes")}</h1>
      <Outlet />
    </main>
  );
}
