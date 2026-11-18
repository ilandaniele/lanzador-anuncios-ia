import { Link } from "react-router";
import { t } from "../../i18n/es-AR";

export default function HoyPage() {
  return (
    <main>
      <h1>{t("nav.hoy")}</h1>
      <p>{t("hoy.emptyBody")}</p>
      <Link to="../lanzador">{t("hoy.newLaunch")}</Link>
    </main>
  );
}
