import { useState } from "react";
import type { LaunchDto } from "../../../shared/schemas/launch";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Input } from "../../components/TextField";
import { t } from "../../i18n/es-AR";
import { formatMoney } from "../../lib/money";
import { formatStart, plannedStart } from "./progress-model";
import { fromLocalInputValue } from "./schedule";
import { useActivateLaunch } from "./use-launch-progress";

type ActivateDialogProps = {
  workspaceId: string;
  launch: LaunchDto;
  adsCount: number;
  askStart: boolean;
  onClose: () => void;
};

export function ActivateDialog({
  workspaceId,
  launch,
  adsCount,
  askStart,
  onClose,
}: ActivateDialogProps) {
  const activate = useActivateLaunch(workspaceId, launch.id);
  const [picked, setPicked] = useState<string>();
  const [showPastError, setShowPastError] = useState(false);
  const startAt = askStart ? picked : plannedStart(launch.startAt);

  function confirm() {
    const startIsInvalid =
      askStart && (picked === undefined || Date.parse(picked) <= Date.now());
    if (startIsInvalid) {
      setShowPastError(true);
      return;
    }
    activate.mutate(startAt, { onSuccess: onClose });
  }

  return (
    <ConfirmDialog
      title={
        askStart
          ? t("launchProgress.confirmScheduleTitle")
          : t("launchProgress.confirmTitle")
      }
      confirmLabel={
        askStart ? t("launchProgress.schedule") : t("launchProgress.activate")
      }
      submittingLabel={t("launchProgress.activating")}
      amount={
        launch.dailyBudgetMinor !== null && launch.currency !== null
          ? formatMoney(launch.dailyBudgetMinor, launch.currency)
          : undefined
      }
      rows={[
        { label: t("launchProgress.rowAds"), value: String(adsCount) },
        { label: t("launchProgress.rowStart"), value: formatStart(startAt) },
      ]}
      consequence={
        startAt
          ? t("launchProgress.confirmScheduleConsequence")
          : t("launchProgress.confirmConsequence")
      }
      submitting={activate.isPending}
      errorMessage={
        activate.isError ? t("launchProgress.activateFailed") : undefined
      }
      onConfirm={confirm}
      onCancel={onClose}
    >
      {askStart && (
        <Input
          type="datetime-local"
          label={t("launcher.step5.scheduleDateLabel")}
          error={showPastError ? t("launcher.step5.schedulePast") : undefined}
          onChange={(event) => {
            setShowPastError(false);
            setPicked(fromLocalInputValue(event.target.value));
          }}
        />
      )}
    </ConfirmDialog>
  );
}
