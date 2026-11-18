import { useEffect } from "react";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n/es-AR";
import { ActivateDialog } from "../launch/ActivateDialog";
import { useLaunch } from "../launch/use-draft";

type ActivateLaunchProps = {
  workspaceId: string;
  launchId: string;
  onClose: () => void;
};

export function ActivateLaunch({
  workspaceId,
  launchId,
  onClose,
}: ActivateLaunchProps) {
  const detail = useLaunch(workspaceId, launchId);
  const { notify } = useToast();
  const launch = detail.data?.launch;

  useEffect(() => {
    if (!detail.isError) return;
    notify({ tone: "error", message: t("hoy.activateLoadFailed") });
    onClose();
  }, [detail.isError, notify, onClose]);

  if (!launch) return null;
  return (
    <ActivateDialog
      workspaceId={workspaceId}
      launch={launch}
      adsCount={launch.itemsDone}
      askStart={false}
      onClose={onClose}
    />
  );
}
