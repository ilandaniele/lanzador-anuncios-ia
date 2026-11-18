import { Link } from "react-router";
import { t } from "../../i18n/es-AR";

export default function NotFoundPage() {
  return (
    <main>
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.body")}</p>
      <Link to="/">{t("notFound.home")}</Link>
    </main>
  );
}
