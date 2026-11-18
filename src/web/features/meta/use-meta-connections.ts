import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { PAGINATION } from "../../../shared/constants";
import type {
  AssetDto,
  ConnectionDto,
  PatchAssetsRequest,
  assetsListResponseSchema,
} from "../../../shared/schemas/meta-connections";
import type { MetaConnectResponse } from "../../../shared/schemas/meta-oauth";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";
import { redirectToExternal } from "./external-redirect";

type AssetsPage = z.infer<typeof assetsListResponseSchema>;

const metaApi = (workspaceId: string) => `/api/w/${workspaceId}/meta`;

async function fetchAllAssets(workspaceId: string): Promise<AssetDto[]> {
  const assets: AssetDto[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: String(PAGINATION.maxLimit) });
    if (cursor) query.set("cursor", cursor);
    const page: AssetsPage = await apiFetch<AssetsPage>(
      `${metaApi(workspaceId)}/assets?${query}`,
    );
    assets.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);
  return assets;
}

export const useConnections = (workspaceId: string) =>
  useQuery({
    queryKey: qk.metaConnections(workspaceId),
    queryFn: async () =>
      (
        await apiFetch<{ data: ConnectionDto[] }>(
          `${metaApi(workspaceId)}/connections`,
        )
      ).data,
  });

export const useAssets = (workspaceId: string) =>
  useQuery({
    queryKey: qk.metaAssetsAll(workspaceId),
    queryFn: () => fetchAllAssets(workspaceId),
  });

export function useStartConnect(workspaceId: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<MetaConnectResponse>(`${metaApi(workspaceId)}/connect`, {
        method: "POST",
      }),
    onSuccess: ({ authorizeUrl }) => redirectToExternal(authorizeUrl),
  });
}

function useInvalidateMeta(workspaceId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.metaAssets(workspaceId) }),
      queryClient.invalidateQueries({
        queryKey: qk.metaConnections(workspaceId),
      }),
    ]);
}

export function usePatchAssets(workspaceId: string) {
  return useMutation({
    mutationFn: (changes: PatchAssetsRequest["changes"]) =>
      apiFetch(`${metaApi(workspaceId)}/assets`, {
        method: "PATCH",
        body: { changes },
      }),
    onSuccess: useInvalidateMeta(workspaceId),
  });
}

export function useRefreshAssets(workspaceId: string) {
  return useMutation({
    mutationFn: (connectionId: string) =>
      apiFetch(
        `${metaApi(workspaceId)}/connections/${connectionId}/refresh-assets`,
        { method: "POST" },
      ),
    onSuccess: useInvalidateMeta(workspaceId),
  });
}

export function useDisconnect(workspaceId: string) {
  return useMutation({
    mutationFn: (connectionId: string) =>
      apiFetch(`${metaApi(workspaceId)}/connections/${connectionId}`, {
        method: "DELETE",
        body: { confirm: true },
      }),
    onSuccess: useInvalidateMeta(workspaceId),
  });
}
