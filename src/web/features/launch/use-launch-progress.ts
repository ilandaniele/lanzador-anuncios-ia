import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type {
  LaunchActivateRequest,
  LaunchProgress,
} from "../../../shared/schemas/launch";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";
import { useServerPolling } from "../../lib/use-server-polling";

const launchApi = (workspaceId: string, launchId: string) =>
  `/api/w/${workspaceId}/launches/${launchId}`;

export const fetchLaunchProgress = (workspaceId: string, launchId: string) =>
  apiFetch<LaunchProgress>(`${launchApi(workspaceId, launchId)}/progress`);

export function useLaunchProgress(workspaceId: string, launchId: string) {
  const queryClient = useQueryClient();
  const progress = useServerPolling(
    qk.launchProgress(workspaceId, launchId),
    () => fetchLaunchProgress(workspaceId, launchId),
  );
  const status = progress.data?.status;

  useEffect(() => {
    if (status)
      void queryClient.invalidateQueries({
        queryKey: qk.launch(workspaceId, launchId),
      });
  }, [status, queryClient, workspaceId, launchId]);

  return progress;
}

function useRefreshProgress(workspaceId: string, launchId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: qk.launchProgress(workspaceId, launchId),
      }),
      queryClient.invalidateQueries({
        queryKey: qk.launch(workspaceId, launchId),
      }),
    ]);
}

export function useActivateLaunch(workspaceId: string, launchId: string) {
  const refresh = useRefreshProgress(workspaceId, launchId);
  return useMutation({
    mutationFn: (startAt?: string) =>
      apiFetch<{ status: "activating" }>(
        `${launchApi(workspaceId, launchId)}/activate`,
        {
          method: "POST",
          body: { confirm: true, startAt } satisfies LaunchActivateRequest,
        },
      ),
    onSettled: refresh,
  });
}

export function useRetryFailed(workspaceId: string, launchId: string) {
  const refresh = useRefreshProgress(workspaceId, launchId);
  return useMutation({
    mutationFn: () =>
      apiFetch<{ status: "queued" }>(
        `${launchApi(workspaceId, launchId)}/retry-failed`,
        { method: "POST", body: { confirm: true } },
      ),
    onSettled: refresh,
  });
}
