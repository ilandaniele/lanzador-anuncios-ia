import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n/es-AR";
import { useCountdown } from "../auth/use-countdown";
import { useRefreshToday } from "./use-today";

const COOLDOWN_SECONDS = 60;
const SECONDS_PER_MINUTE = 60;

const formatCountdown = (seconds: number) =>
  `${Math.floor(seconds / SECONDS_PER_MINUTE)}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, "0")}`;

export function RefreshControl({ workspaceId }: { workspaceId: string }) {
  const { remaining, restart } = useCountdown(COOLDOWN_SECONDS, 0);
  const refresh = useRefreshToday(workspaceId);
  const { notify } = useToast();
  const cooling = remaining > 0;

  return (
    <Button
      variant="secondary"
      disabled={cooling}
      loading={refresh.isPending}
      loadingLabel={t("common.working")}
      onClick={() =>
        refresh.mutate(undefined, {
          onSuccess: restart,
          onError: () =>
            notify({ tone: "error", message: t("hoy.refreshFailed") }),
        })
      }
    >
      {cooling
        ? `${t("hoy.refreshIn")} ${formatCountdown(remaining)}`
        : t("hoy.refresh")}
    </Button>
  );
}
