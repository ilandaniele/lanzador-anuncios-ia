import { Button } from "../../components/Button";
import { t } from "../../i18n/es-AR";
import { formatCountdown } from "../../lib/format-countdown";
import { useCountdown } from "../auth/use-countdown";
import { useRunPilot } from "./use-pilot-run";

const RUN_GAP_SECONDS = 5 * 60;
const MS_PER_SECOND = 1000;

const secondsUntilAllowed = (lastRunAt: number | null) =>
  lastRunAt === null
    ? 0
    : Math.max(
        0,
        Math.ceil(
          (lastRunAt + RUN_GAP_SECONDS * MS_PER_SECOND - Date.now()) /
            MS_PER_SECOND,
        ),
      );

type RunNowButtonProps = { workspaceId: string; lastRunAt: number | null };

export function RunNowButton({ workspaceId, lastRunAt }: RunNowButtonProps) {
  const { remaining } = useCountdown(
    RUN_GAP_SECONDS,
    secondsUntilAllowed(lastRunAt),
  );
  const run = useRunPilot(workspaceId);
  const cooling = remaining > 0;

  return (
    <Button
      variant="secondary"
      disabled={cooling}
      loading={run.isPending}
      loadingLabel={t("common.working")}
      onClick={() => run.mutate()}
    >
      {cooling
        ? `${t("pilot.runNowIn")} ${formatCountdown(remaining)}`
        : t("pilot.runNow")}
    </Button>
  );
}
