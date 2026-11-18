import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RefreshMetricsResponse } from "../../../shared/schemas/metrics";
import type { TodayResponse } from "../../../shared/schemas/today";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";
import { useVisiblePolling } from "../../lib/use-server-polling";

const workspaceApi = (workspaceId: string) => `/api/w/${workspaceId}`;

export const todayQueryOptions = (workspaceId: string) => ({
  queryKey: qk.today(workspaceId),
  queryFn: () => apiFetch<TodayResponse>(`${workspaceApi(workspaceId)}/today`),
});

export const useToday = (workspaceId: string) => {
  const { queryKey, queryFn } = todayQueryOptions(workspaceId);
  return useVisiblePolling(queryKey, queryFn);
};

export function useRefreshToday(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<RefreshMetricsResponse>(
        `${workspaceApi(workspaceId)}/metrics/refresh`,
        { method: "POST" },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: qk.today(workspaceId) }),
  });
}
