import { useEffect, useState } from "react";
import { Button, buttonClass } from "../../components/Button";
import { ToggleChip } from "../../components/Chip";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { syncActiveLaunch } from "../../features/launch/active-launch";
import { ProgressDecision } from "../../features/launch/ProgressDecision";
import { ProgressItemList } from "../../features/launch/ProgressItemList";
import {
  canRetry,
  isDecisionStage,
  isFinished,
  statusLine,
  visibleItems,
} from "../../features/launch/progress-model";
import { ProgressSummary } from "../../features/launch/ProgressSummary";
import { useLaunch } from "../../features/launch/use-draft";
import {
  useLaunchProgress,
  useRetryFailed,
} from "../../features/launch/use-launch-progress";
import { t } from "../../i18n/es-AR";

type ProgressViewProps = { workspaceId: string; launchId: string };

export function ProgressView({ workspaceId, launchId }: ProgressViewProps) {
  const progress = useLaunchProgress(workspaceId, launchId);
  const detail = useLaunch(workspaceId, launchId);
  const retry = useRetryFailed(workspaceId, launchId);
  const [onlyErrors, setOnlyErrors] = useState<boolean>();
  const data = progress.data;
  const finished = data !== undefined && isFinished(data);

  useEffect(() => {
    if (data) syncActiveLaunch(workspaceId, launchId, isFinished(data));
  }, [data, workspaceId, launchId]);

  if (progress.isError)
    return (
      <main role="alert" className="flex items-center gap-3 p-4">
        <p className="text-loss">{t("launchProgress.loadFailed")}</p>
        <Button variant="secondary" onClick={() => void progress.refetch()}>
          {t("errors.retry")}
        </Button>
      </main>
    );
  if (!data)
    return (
      <SkeletonRegion label={t("common.loading")} className="p-4">
        <Skeleton className="h-10 w-full" />
      </SkeletonRegion>
    );

  const launch = detail.data?.launch;
  const name =
    detail.data?.plan?.campaign?.name ??
    launch?.draft.campaignName ??
    t("launchProgress.untitled");
  const filterErrors = onlyErrors ?? (finished && data.counts.failed > 0);

  return (
    <main className="flex max-w-[720px] flex-col gap-6 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t(
            finished
              ? "launchProgress.titleDone"
              : "launchProgress.titleRunning",
          )}
          : {name}
        </h1>
        <p className="text-ink-muted">{statusLine(data, launch?.startAt)}</p>
      </header>
      <ProgressSummary progress={data} />
      <div className="flex flex-wrap items-center gap-2">
        <ToggleChip pressed={filterErrors} onToggle={setOnlyErrors}>
          {t("launchProgress.onlyErrors")}
        </ToggleChip>
        {canRetry(data) && (
          <Button
            loading={retry.isPending}
            loadingLabel={t("launchProgress.retrying")}
            onClick={() => retry.mutate()}
          >
            {t("launchProgress.retry")}
          </Button>
        )}
        {launch?.metaCampaignUrl && (
          <a
            href={launch.metaCampaignUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass("secondary")}
          >
            {t("launchProgress.viewInMeta")}
          </a>
        )}
      </div>
      {retry.isError && (
        <p role="alert" className="text-loss">
          {t("launchProgress.retryFailed")}
        </p>
      )}
      <ProgressItemList items={visibleItems(data.items, filterErrors)} />
      {launch && isDecisionStage(data) && (
        <ProgressDecision
          workspaceId={workspaceId}
          launch={launch}
          progress={data}
        />
      )}
    </main>
  );
}
