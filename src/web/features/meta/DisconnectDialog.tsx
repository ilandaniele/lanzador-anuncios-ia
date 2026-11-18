import type { ConnectionDto } from "../../../shared/schemas/meta-connections";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n/es-AR";
import { metaErrorMessage } from "./meta-errors";
import { useDisconnect } from "./use-meta-connections";

type DisconnectDialogProps = {
  workspaceId: string;
  connection: ConnectionDto;
  onClose: () => void;
};

export function DisconnectDialog({
  workspaceId,
  connection,
  onClose,
}: DisconnectDialogProps) {
  const disconnect = useDisconnect(workspaceId);
  const { notify } = useToast();

  return (
    <ConfirmDialog
      title={t("connections.disconnectTitle")}
      confirmLabel={t("connections.disconnect")}
      rows={[
        {
          label: t("connections.receiptBusiness"),
          value: connection.businessName ?? connection.businessId,
        },
        {
          label: t("connections.receiptCreatives"),
          value: String(connection.creativeCount),
        },
      ]}
      consequence={t("connections.disconnectConsequence")}
      submitting={disconnect.isPending}
      errorMessage={
        disconnect.error ? metaErrorMessage(disconnect.error) : undefined
      }
      onConfirm={() =>
        disconnect.mutate(connection.id, {
          onSuccess: () => {
            onClose();
            notify({
              tone: "success",
              message: t("connections.disconnected"),
            });
          },
        })
      }
      onCancel={onClose}
    />
  );
}
