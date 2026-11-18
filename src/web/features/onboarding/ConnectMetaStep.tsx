import { Button } from "../../components/Button";
import { t } from "../../i18n/es-AR";
import { metaErrorMessage } from "../meta/meta-errors";
import { useStartConnect } from "../meta/use-meta-connections";

export function ConnectMetaStep({ workspaceId }: { workspaceId: string }) {
  const connect = useStartConnect(workspaceId);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink">{t("onboarding.connectIntro")}</p>
      <ul className="list-disc pl-6 text-ink">
        <li>{t("onboarding.permissionRead")}</li>
        <li>{t("onboarding.permissionCreate")}</li>
        <li>{t("onboarding.permissionMetrics")}</li>
      </ul>
      {connect.isError && (
        <p role="alert" className="rounded-sm bg-loss-soft p-3 text-ink">
          {metaErrorMessage(connect.error)}
        </p>
      )}
      <div>
        <Button
          loading={connect.isPending}
          loadingLabel={t("common.working")}
          onClick={() => connect.mutate()}
        >
          {t("connections.connect")}
        </Button>
      </div>
    </div>
  );
}
