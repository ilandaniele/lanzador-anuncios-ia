import { useState } from "react";
import type { ConnectionDto } from "../../../shared/schemas/meta-connections";
import { Button } from "../../components/Button";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n/es-AR";
import { AssetPicker } from "./AssetPicker";
import { ConnectionCard } from "./ConnectionCard";
import { DisconnectDialog } from "./DisconnectDialog";
import { EnabledAccounts } from "./EnabledAccounts";
import { metaErrorMessage } from "./meta-errors";
import { useCanManageMeta } from "./use-can-manage-meta";
import {
  useConnections,
  useRefreshAssets,
  useStartConnect,
} from "./use-meta-connections";

type MetaBlockProps = { workspaceId: string; initialChoosing: boolean };

export function MetaBlock({ workspaceId, initialChoosing }: MetaBlockProps) {
  const connections = useConnections(workspaceId);
  const canManage = useCanManageMeta(workspaceId);
  const connect = useStartConnect(workspaceId);
  const refresh = useRefreshAssets(workspaceId);
  const { notify } = useToast();
  const [choosing, setChoosing] = useState(initialChoosing);
  const [disconnecting, setDisconnecting] = useState<ConnectionDto | null>(
    null,
  );

  const startConnect = () =>
    connect.mutate(undefined, {
      onError: (error) =>
        notify({ tone: "error", message: metaErrorMessage(error) }),
    });

  const refreshAssets = (connectionId: string) =>
    refresh.mutate(connectionId, {
      onSuccess: () =>
        notify({ tone: "success", message: t("connections.assetsRefreshed") }),
      onError: (error) =>
        notify({ tone: "error", message: metaErrorMessage(error) }),
    });

  if (connections.isPending)
    return (
      <SkeletonRegion
        label={t("common.loading")}
        className="flex flex-col gap-4"
      >
        <Skeleton className="h-24" />
      </SkeletonRegion>
    );

  if (connections.isError)
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p>{t("connections.loadError")}</p>
        <Button variant="secondary" onClick={() => void connections.refetch()}>
          {t("errors.retry")}
        </Button>
      </div>
    );

  if (connections.data.length === 0)
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-ink-muted">
          {t(
            canManage
              ? "connections.notConnected"
              : "connections.notConnectedReadOnly",
          )}
        </p>
        {canManage && (
          <Button
            loading={connect.isPending}
            loadingLabel={t("common.working")}
            onClick={startConnect}
          >
            {t("connections.connect")}
          </Button>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-4">
        {connections.data.map((connection) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            canManage={canManage}
            reconnecting={connect.isPending}
            refreshing={
              refresh.isPending && refresh.variables === connection.id
            }
            onReconnect={startConnect}
            onRefresh={() => refreshAssets(connection.id)}
            onDisconnect={() => setDisconnecting(connection)}
          />
        ))}
      </ul>
      <EnabledAccounts workspaceId={workspaceId} />
      {canManage && !choosing && (
        <div>
          <Button variant="secondary" onClick={() => setChoosing(true)}>
            {t("connections.chooseAssets")}
          </Button>
        </div>
      )}
      {canManage && choosing && (
        <section aria-labelledby="elegir-activos-titulo">
          <h3 id="elegir-activos-titulo" className="mb-4 text-lg font-semibold">
            {t("connections.picker.title")}
          </h3>
          <AssetPicker workspaceId={workspaceId} />
        </section>
      )}
      {disconnecting && (
        <DisconnectDialog
          workspaceId={workspaceId}
          connection={disconnecting}
          onClose={() => setDisconnecting(null)}
        />
      )}
    </div>
  );
}
