import { Link } from "react-router";
import type { Role } from "../../../shared/constants";
import { buttonClass } from "../../components/Button";
import { t } from "../../i18n/es-AR";
import { BillingPanel } from "./BillingPanel";

type PaywallProps = { workspaceId: string; role: Role };

export function Paywall({ workspaceId, role }: PaywallProps) {
  const isOwner = role === "owner";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-160 flex-col justify-center gap-4 px-4 py-8 text-md">
      <h1 className="text-xl font-semibold text-ink">
        {t("billing.paywall.title")}
      </h1>
      {isOwner ? (
        <>
          <p className="text-ink">{t("billing.paywall.ownerBody")}</p>
          <BillingPanel workspaceId={workspaceId} />
        </>
      ) : (
        <>
          <p className="text-ink">{t("billing.paywall.askOwner")}</p>
          <div>
            <Link to="/" className={buttonClass("secondary")}>
              {t("billing.paywall.goHome")}
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
