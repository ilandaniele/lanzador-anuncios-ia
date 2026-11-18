import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PilotRule,
  PilotRulesResponse,
  UpdatePilotRulesRequest,
} from "../../../shared/schemas/pilot";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

const rulesPath = (workspaceId: string) => `/api/w/${workspaceId}/pilot/rules`;

export const usePilotRules = (workspaceId: string) =>
  useQuery({
    queryKey: qk.pilotRules(workspaceId),
    queryFn: () => apiFetch<PilotRulesResponse>(rulesPath(workspaceId)),
  });

export function useSavePilotRules(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rules: PilotRule[]) =>
      apiFetch<PilotRulesResponse>(rulesPath(workspaceId), {
        method: "PUT",
        body: { rules } satisfies UpdatePilotRulesRequest,
      }),
    onSuccess: (response) =>
      queryClient.setQueryData(qk.pilotRules(workspaceId), response),
  });
}
