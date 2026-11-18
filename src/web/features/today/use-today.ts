import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RefreshMetricsResponse } from "../../../shared/schemas/metrics";
import type { TodayResponse } from "../../../shared/schemas/today";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";
import { useVisiblePolling } from "../../lib/use-server-polling";

const workspaceApi = (workspaceId: string) => `/api/w/${workspaceId}`;

export const useToday = (workspaceId: string) =>
  useVisiblePolling(qk.today(workspaceId), () =>
    apiFetch<TodayResponse>(`${workspaceApi(workspaceId)}/today`),
  );

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
