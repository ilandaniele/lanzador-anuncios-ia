import { useQuery } from "@tanstack/react-query";
import { PAGINATION } from "../../../shared/constants";
import type { CopyDto } from "../../../shared/schemas/copies";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

export const useSavedCopies = (workspaceId: string, productId: string) =>
  useQuery({
    queryKey: qk.productCopies(workspaceId, productId),
    enabled: productId !== "",
    queryFn: async () =>
      (
        await apiFetch<{ data: CopyDto[] }>(
          `/api/w/${workspaceId}/products/${productId}/copies?status=saved&limit=${PAGINATION.maxLimit}`,
        )
      ).data,
  });
