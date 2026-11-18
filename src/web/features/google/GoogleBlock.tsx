import { Button } from "../../components/Button";
import { StatusChip } from "../../components/Chip";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { t } from "../../i18n/es-AR";
import { GoogleConnectPrompt } from "./GoogleConnectPrompt";
import { GoogleDisconnect } from "./GoogleDisconnect";
import { useGoogleConnection } from "./use-google-connection";

export function GoogleBlock({ workspaceId }: { workspaceId: string }) {
  const connection = useGoogleConnection(workspaceId);

  if (connection.isPending)
    return (
      <SkeletonRegion label={t("common.loading")}>
        <Skeleton className="h-16" />
      </SkeletonRegion>
    );

  if (connection.isError)
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p>{t("google.loadError")}</p>
        <Button variant="secondary" onClick={() => void connection.refetch()}>
          {t("errors.retry")}
        </Button>
      </div>
    );

  const { connected, email, status } = connection.data;
  if (!connected)
    return (
      <GoogleConnectPrompt workspaceId={workspaceId} reconnecting={false} />
    );

  const active = status === "active";
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-rule p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">
          {t("google.connectedAs")} {email}
        </p>
        <StatusChip tone={active ? "ready" : "error"}>
          {t(
            active ? "connections.statusActive" : "connections.statusReconnect",
          )}
        </StatusChip>
      </div>
      {!active && (
        <GoogleConnectPrompt workspaceId={workspaceId} reconnecting />
      )}
      <GoogleDisconnect workspaceId={workspaceId} email={email} />
    </div>
  );
}
