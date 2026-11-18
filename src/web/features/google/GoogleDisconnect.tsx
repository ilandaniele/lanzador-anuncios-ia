import { useState } from "react";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n/es-AR";
import { googleErrorMessage } from "./google-errors";
import { useDisconnectGoogle } from "./use-google-connection";

type GoogleDisconnectProps = { workspaceId: string; email: string | null };

export function GoogleDisconnect({
  workspaceId,
  email,
}: GoogleDisconnectProps) {
  const disconnect = useDisconnectGoogle(workspaceId);
  const { notify } = useToast();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button variant="danger" onClick={() => setConfirming(true)}>
        {t("google.disconnect")}
      </Button>
      {confirming && (
        <ConfirmDialog
          title={t("google.disconnectTitle")}
          confirmLabel={t("google.disconnect")}
          rows={
            email ? [{ label: t("google.receiptAccount"), value: email }] : []
          }
          consequence={t("google.disconnectConsequence")}
          submitting={disconnect.isPending}
          errorMessage={
            disconnect.error ? googleErrorMessage(disconnect.error) : undefined
          }
          onConfirm={() =>
            disconnect.mutate(undefined, {
              onSuccess: () => {
                setConfirming(false);
                notify({ tone: "success", message: t("google.disconnected") });
              },
            })
          }
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
