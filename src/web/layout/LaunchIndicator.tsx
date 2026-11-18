import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { focusRing } from "../components/classes";
import { StatusChip } from "../components/Chip";
import {
  forgetActiveLaunch,
  recallActiveLaunch,
  syncActiveLaunch,
} from "../features/launch/active-launch";
import { isFinished } from "../features/launch/progress-model";
import { fetchLaunchProgress } from "../features/launch/use-launch-progress";
import { t } from "../i18n/es-AR";
import { ApiError } from "../lib/api";
import { qk } from "../lib/query-keys";
import { workspacePath } from "./nav-items";

export function LaunchIndicator({ workspaceId }: { workspaceId: string }) {
  const { pathname } = useLocation();
  const launchId = recallActiveLaunch(workspaceId);
  const launchPath = workspacePath(workspaceId, `lanzador/${launchId}`);
  const onProgressView = pathname === launchPath;
  const { data, error, refetch } = useQuery({
    queryKey: qk.launchProgress(workspaceId, launchId ?? ""),
    queryFn: () => fetchLaunchProgress(workspaceId, launchId ?? ""),
    enabled: launchId !== null && !onProgressView,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (launchId !== null && !onProgressView)
      void refetch({ cancelRefetch: false });
  }, [pathname, launchId, onProgressView, refetch]);

  useEffect(() => {
    if (launchId !== null && data)
      syncActiveLaunch(workspaceId, launchId, isFinished(data));
  }, [data, workspaceId, launchId]);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 404)
      forgetActiveLaunch(workspaceId);
  }, [error, workspaceId]);

  if (launchId === null || onProgressView || !data || isFinished(data))
    return null;
  return (
    <Link to={launchPath} className={focusRing}>
      <StatusChip tone="progress">
        {t("launchProgress.indicator")} {data.counts.done}/{data.counts.total}
      </StatusChip>
    </Link>
  );
}
