import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import type { createWorkspaceResponseSchema } from "../../../shared/schemas/workspaces";
import { ApiError, apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

type CreateWorkspaceResponse = z.infer<typeof createWorkspaceResponseSchema>;

export const isBetaInviteRequired = (error: unknown) =>
  error instanceof ApiError && error.code === "BETA_INVITE_REQUIRED";

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<CreateWorkspaceResponse>("/api/workspaces", {
        method: "POST",
        body: { name },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.me() }),
  });
}
