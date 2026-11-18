import { Skeleton } from "../../components/Skeleton";
import { t } from "../../i18n/es-AR";
import { RunNowButton } from "./RunNowButton";
import { useCanDecide } from "./use-can-decide";
import { useLastPilotRun } from "./use-pilot-run";

const formatRunTime = (startedAt: string) =>
  new Date(startedAt).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });

export function PilotHeader({ workspaceId }: { workspaceId: string }) {
  const canRun = useCanDecide(workspaceId);
  const lastRun = useLastPilotRun(workspaceId);
  const run = lastRun.data;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 id="piloto-titulo" className="text-xl font-semibold">
          {t("pilot.title")}
        </h1>
        {lastRun.isSuccess && (
          <p className="text-ink-muted">
            {run
              ? `${t("pilot.lastRun")}: ${formatRunTime(run.startedAt)}`
              : t("pilot.noRuns")}
          </p>
        )}
      </div>
      {canRun &&
        (lastRun.isPending ? (
          <Skeleton className="h-10 w-40" />
        ) : (
          <RunNowButton
            key={run?.id}
            workspaceId={workspaceId}
            lastRunAt={run ? Date.parse(run.startedAt) : null}
          />
        ))}
    </div>
  );
}
