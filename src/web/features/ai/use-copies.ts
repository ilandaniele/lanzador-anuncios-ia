import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CopyDto,
  CopyPatch,
  GenerateCopiesRequest,
} from "../../../shared/schemas/copies";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

type PatchCopyInput = { copyId: string; changes: CopyPatch };

export const useGenerateCopies = (workspaceId: string, productId: string) =>
  useMutation({
    mutationFn: async (body: GenerateCopiesRequest) =>
      (
        await apiFetch<{ data: CopyDto[] }>(
          `/api/w/${workspaceId}/products/${productId}/copies/generate`,
          { method: "POST", body },
        )
      ).data,
  });

export const usePatchCopy = (workspaceId: string, productId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ copyId, changes }: PatchCopyInput) =>
      (
        await apiFetch<{ copy: CopyDto }>(
          `/api/w/${workspaceId}/copies/${copyId}`,
          { method: "PATCH", body: changes },
        )
      ).copy,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: qk.productCopies(workspaceId, productId),
      }),
  });
};
