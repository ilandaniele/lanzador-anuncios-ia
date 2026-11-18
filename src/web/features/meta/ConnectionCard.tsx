import type { ConnectionDto } from "../../../shared/schemas/meta-connections";
import { Button } from "../../components/Button";
import { StatusChip } from "../../components/Chip";
import { t } from "../../i18n/es-AR";
import { connectionStatus, expiryDate } from "./connection-status";

type ConnectionCardProps = {
  connection: ConnectionDto;
  canManage: boolean;
  reconnecting: boolean;
  refreshing: boolean;
  onReconnect: () => void;
  onRefresh: () => void;
  onDisconnect: () => void;
};

export function ConnectionCard({
  connection,
  canManage,
  reconnecting,
  refreshing,
  onReconnect,
  onRefresh,
  onDisconnect,
}: ConnectionCardProps) {
  const { tone, label } = connectionStatus(connection);

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-rule p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">
          {connection.businessName ?? connection.businessId}
        </h4>
        <StatusChip tone={tone}>{label}</StatusChip>
      </div>
      {connection.tokenExpiresAt && (
        <p className="text-ink-muted">
          {expiryDate(connection.tokenExpiresAt)}
        </p>
      )}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={
              connection.status === "reconnect_required"
                ? "primary"
                : "secondary"
            }
            loading={reconnecting}
            loadingLabel={t("common.working")}
            onClick={onReconnect}
          >
            {t("connections.reconnect")}
          </Button>
          <Button
            variant="secondary"
            loading={refreshing}
            loadingLabel={t("common.working")}
            onClick={onRefresh}
          >
            {t("connections.refreshAssets")}
          </Button>
          <Button variant="danger" onClick={onDisconnect}>
            {t("connections.disconnect")}
          </Button>
        </div>
      )}
    </li>
  );
}
