import { useState } from "react";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { t } from "../../i18n/es-AR";
import { useEndSession } from "../auth/use-end-session";

export function SessionActions() {
  const logout = useEndSession("logout");
  const logoutAll = useEndSession("logout-all");
  const [confirmingAll, setConfirmingAll] = useState(false);

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        variant="secondary"
        loading={logout.isPending}
        loadingLabel={t("common.working")}
        onClick={() => logout.mutate()}
      >
        {t("account.logout")}
      </Button>
      {logout.isError && (
        <p role="alert" className="text-loss">
          {t("errors.generic")}
        </p>
      )}
      <Button variant="secondary" onClick={() => setConfirmingAll(true)}>
        {t("account.logoutAll")}
      </Button>
      {confirmingAll && (
        <ConfirmDialog
          title={t("account.logoutAll")}
          confirmLabel={t("account.logoutAll")}
          consequence={t("account.logoutAllConsequence")}
          submitting={logoutAll.isPending}
          errorMessage={logoutAll.isError ? t("errors.generic") : undefined}
          onConfirm={() => logoutAll.mutate()}
          onCancel={() => setConfirmingAll(false)}
        />
      )}
    </div>
  );
}
