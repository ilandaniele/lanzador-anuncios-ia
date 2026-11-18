import { Button } from "../../components/Button";
import { t } from "../../i18n/es-AR";
import { googleErrorMessage } from "./google-errors";
import { useStartGoogleConnect } from "./use-google-connection";

type GoogleConnectPromptProps = {
  workspaceId: string;
  reconnecting: boolean;
  launchId?: string;
};

export function GoogleConnectPrompt({
  workspaceId,
  reconnecting,
  launchId,
}: GoogleConnectPromptProps) {
  const connect = useStartGoogleConnect(workspaceId, launchId);

  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-ink-muted">
        {t(reconnecting ? "google.reconnectRequired" : "google.notConnected")}
      </p>
      <Button
        loading={connect.isPending}
        loadingLabel={t("common.working")}
        onClick={() => connect.mutate()}
      >
        {t(reconnecting ? "google.reconnect" : "google.connect")}
      </Button>
      {connect.isError && (
        <p role="alert" className="text-loss">
          {googleErrorMessage(connect.error)}
        </p>
      )}
    </div>
  );
}
