import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  GoogleConnectResponse,
  GoogleConnectionResponse,
} from "../../../shared/schemas/google";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";
import { redirectToExternal } from "../meta/external-redirect";

export const googleApi = (workspaceId: string) =>
  `/api/w/${workspaceId}/google`;

export const useGoogleConnection = (workspaceId: string) =>
  useQuery({
    queryKey: qk.googleConnection(workspaceId),
    queryFn: () =>
      apiFetch<GoogleConnectionResponse>(
        `${googleApi(workspaceId)}/connection`,
      ),
  });

export function useStartGoogleConnect(workspaceId: string, launchId?: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<GoogleConnectResponse>(`${googleApi(workspaceId)}/connect`, {
        method: "POST",
        body: launchId ? { launchId } : undefined,
      }),
    onSuccess: ({ authorizeUrl }) => redirectToExternal(authorizeUrl),
  });
}

export function useDisconnectGoogle(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`${googleApi(workspaceId)}/connection`, { method: "DELETE" }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: qk.googleConnection(workspaceId),
      }),
  });
}
