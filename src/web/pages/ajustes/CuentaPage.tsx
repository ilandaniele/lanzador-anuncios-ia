import { SessionActions } from "../../features/account/SessionActions";
import { ThemePicker } from "../../features/account/ThemePicker";
import { t } from "../../i18n/es-AR";

export default function CuentaPage() {
  return (
    <section aria-labelledby="cuenta-titulo" className="flex flex-col gap-6">
      <h2 id="cuenta-titulo" className="text-xl font-semibold">
        {t("settings.account")}
      </h2>
      <ThemePicker />
      <section
        aria-labelledby="sesiones-titulo"
        className="flex flex-col gap-3"
      >
        <h3 id="sesiones-titulo" className="font-semibold">
          {t("account.sessions")}
        </h3>
        <SessionActions />
      </section>
    </section>
  );
}
