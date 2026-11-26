import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";
import { PAGINATION } from "../../../shared/constants";
import type {
  AddMetaTesterRequest,
  adminWorkspacesPageSchema,
  BetaInviteResponse,
  CreateBetaInviteRequest,
  PatchAdminWorkspace,
} from "../../../shared/schemas/admin";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

type WorkspacesPage = z.infer<typeof adminWorkspacesPageSchema>;

export const useAdminWorkspaces = () =>
  useInfiniteQuery({
    queryKey: qk.adminWorkspaces(),
    initialPageParam: "",
    getNextPageParam: (page: WorkspacesPage) => page.nextCursor ?? undefined,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: String(PAGINATION.maxLimit) });
      if (pageParam) query.set("cursor", pageParam);
      return apiFetch<WorkspacesPage>(`/api/admin/workspaces?${query}`);
    },
  });

type PatchInput = { id: string; patch: PatchAdminWorkspace };

export function usePatchAdminWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: PatchInput) =>
      apiFetch(`/api/admin/workspaces/${id}`, { method: "PATCH", body: patch }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: qk.adminWorkspaces() }),
  });
}

export const useCreateBetaInvite = () =>
  useMutation({
    mutationFn: (body: CreateBetaInviteRequest) =>
      apiFetch<BetaInviteResponse>("/api/admin/beta-invites", {
        method: "POST",
        body,
      }),
  });

export const useAddMetaTester = () =>
  useMutation({
    mutationFn: (body: AddMetaTesterRequest) =>
      apiFetch("/api/admin/meta-testers", { method: "POST", body }),
  });
