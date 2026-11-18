import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Me } from "../../../shared/schemas/auth";
import type {
  SettingsPatch,
  WorkspaceOverview,
} from "../../../shared/schemas/workspaces";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

const workspaceApi = (workspaceId: string) => `/api/w/${workspaceId}`;

export type GeneralChanges = { name?: string; settings?: SettingsPatch };

export const workspaceOverviewQueryOptions = (workspaceId: string) => ({
  queryKey: qk.workspace(workspaceId),
  queryFn: () => apiFetch<WorkspaceOverview>(workspaceApi(workspaceId)),
});

export const useWorkspaceOverview = (workspaceId: string) =>
  useQuery(workspaceOverviewQueryOptions(workspaceId));

export function useSaveGeneral(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, settings }: GeneralChanges) => {
      const requests: Promise<unknown>[] = [];
      if (name !== undefined)
        requests.push(
          apiFetch(workspaceApi(workspaceId), {
            method: "PATCH",
            body: { name },
          }),
        );
      if (settings !== undefined)
        requests.push(
          apiFetch(`${workspaceApi(workspaceId)}/settings`, {
            method: "PATCH",
            body: settings,
          }),
        );
      await Promise.all(requests);
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.workspace(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: qk.me() }),
      ]),
  });
}

export function useDeleteWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (confirmName: string) =>
      apiFetch(workspaceApi(workspaceId), {
        method: "DELETE",
        body: { confirmName },
      }),
    onSuccess: () =>
      queryClient.setQueryData<Me | null>(qk.me(), (me) =>
        me
          ? {
              ...me,
              workspaces: me.workspaces.filter(({ id }) => id !== workspaceId),
            }
          : me,
      ),
  });
}
