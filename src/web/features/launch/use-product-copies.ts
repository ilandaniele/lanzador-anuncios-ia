import { useQuery } from "@tanstack/react-query";
import { PAGINATION } from "../../../shared/constants";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

export type ProductCopyDto = {
  id: string;
  primaryText: string;
  headline: string;
  description: string | null;
  favorite: boolean;
};

export const useSavedCopies = (workspaceId: string, productId: string) =>
  useQuery({
    queryKey: qk.productCopies(workspaceId, productId),
    enabled: productId !== "",
    queryFn: async () =>
      (
        await apiFetch<{ data: ProductCopyDto[] }>(
          `/api/w/${workspaceId}/products/${productId}/copies?status=saved&limit=${PAGINATION.maxLimit}`,
        )
      ).data,
  });
