import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { LaunchListItemDto } from "../../../shared/schemas/launch";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n/es-AR";
import { qk } from "../../lib/query-keys";
import { ActivateDialog } from "../launch/ActivateDialog";
import { useLaunch } from "../launch/use-draft";

type ActivateFromHistoryProps = {
  workspaceId: string;
  launch: LaunchListItemDto;
  onClose: () => void;
};

export function ActivateFromHistory({
  workspaceId,
  launch,
  onClose,
}: ActivateFromHistoryProps) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const detail = useLaunch(workspaceId, launch.id);
  const failed = detail.isError;

  useEffect(() => {
    if (!failed) return;
    notify({ tone: "error", message: t("launchProgress.loadFailed") });
    onClose();
  }, [failed, notify, onClose]);

  if (!detail.data) return null;

  return (
    <ActivateDialog
      workspaceId={workspaceId}
      launch={detail.data.launch}
      adsCount={launch.itemsDone}
      askStart={false}
      onClose={() => {
        void queryClient.invalidateQueries({
          queryKey: qk.launchHistory(workspaceId),
        });
        onClose();
      }}
    />
  );
}
