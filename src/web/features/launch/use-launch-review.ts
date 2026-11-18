import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  LaunchPlan,
  LaunchStartRequest,
} from "../../../shared/schemas/launch";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

const launchApi = (workspaceId: string, launchId: string) =>
  `/api/w/${workspaceId}/launches/${launchId}`;

function useRefreshLaunch(workspaceId: string, launchId: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: qk.launch(workspaceId, launchId),
    });
}

export function useSimulateLaunch(workspaceId: string, launchId: string) {
  const refresh = useRefreshLaunch(workspaceId, launchId);
  return useMutation({
    mutationFn: () =>
      apiFetch<LaunchPlan>(`${launchApi(workspaceId, launchId)}/simulate`, {
        method: "POST",
      }),
    onSettled: refresh,
  });
}

export function useStartLaunch(workspaceId: string, launchId: string) {
  const refresh = useRefreshLaunch(workspaceId, launchId);
  return useMutation({
    mutationFn: (planHash: string) =>
      apiFetch<{ status: "queued" }>(
        `${launchApi(workspaceId, launchId)}/start`,
        {
          method: "POST",
          body: { confirm: true, planHash } satisfies LaunchStartRequest,
        },
      ),
    onSettled: refresh,
  });
}
