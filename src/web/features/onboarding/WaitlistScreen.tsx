import { Button } from "../../components/Button";
import { t } from "../../i18n/es-AR";
import { useEndSession } from "../auth/use-end-session";

export function WaitlistScreen() {
  const logout = useEndSession("logout");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-140 flex-col justify-center gap-4 px-4 py-8 text-md">
      <h1 className="text-xl font-semibold text-ink">
        {t("onboarding.waitlistTitle")}
      </h1>
      <p className="text-ink">{t("onboarding.waitlistBody")}</p>
      {logout.isError && (
        <p role="alert" className="text-loss">
          {t("errors.generic")}
        </p>
      )}
      <div>
        <Button
          variant="secondary"
          loading={logout.isPending}
          loadingLabel={t("common.working")}
          onClick={() => logout.mutate()}
        >
          {t("account.logout")}
        </Button>
      </div>
    </main>
  );
}
