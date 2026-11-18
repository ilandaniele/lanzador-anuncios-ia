import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";
import { PAGINATION } from "../../../shared/constants";
import type {
  CheckLandingResponse,
  CreateProductRequest,
  ProductDto,
  productsPageSchema,
} from "../../../shared/schemas/products";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

type ProductsPage = z.infer<typeof productsPageSchema>;
type ProductResponse = { product: ProductDto };

const productsApi = (workspaceId: string) => `/api/w/${workspaceId}/products`;

export const useProducts = (workspaceId: string, archived: boolean) =>
  useInfiniteQuery({
    queryKey: qk.productList(workspaceId, archived),
    initialPageParam: "",
    getNextPageParam: (page: ProductsPage) => page.nextCursor ?? undefined,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({
        archived: String(archived),
        limit: String(PAGINATION.maxLimit),
      });
      if (pageParam) query.set("cursor", pageParam);
      return apiFetch<ProductsPage>(`${productsApi(workspaceId)}?${query}`);
    },
  });

export const useProduct = (workspaceId: string, productId: string) =>
  useQuery({
    queryKey: qk.product(workspaceId, productId),
    enabled: productId !== "",
    queryFn: async () =>
      (
        await apiFetch<ProductResponse>(
          `${productsApi(workspaceId)}/${productId}`,
        )
      ).product,
  });

function useProductMutation<Input, Output>(
  workspaceId: string,
  send: (input: Input) => Promise<Output>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: qk.products(workspaceId) }),
  });
}

export const useSaveProduct = (workspaceId: string, productId?: string) =>
  useProductMutation(workspaceId, async (body: CreateProductRequest) => {
    const url = productId
      ? `${productsApi(workspaceId)}/${productId}`
      : productsApi(workspaceId);
    const { product } = await apiFetch<ProductResponse>(url, {
      method: productId ? "PATCH" : "POST",
      body,
    });
    return product;
  });

export const useArchiveProduct = (workspaceId: string, productId: string) =>
  useProductMutation(workspaceId, (archived: boolean) =>
    apiFetch(`${productsApi(workspaceId)}/${productId}/archive`, {
      method: "POST",
      body: { archived },
    }),
  );

export const useDuplicateProduct = (workspaceId: string, productId: string) =>
  useProductMutation(workspaceId, async () => {
    const { product } = await apiFetch<ProductResponse>(
      `${productsApi(workspaceId)}/${productId}/duplicate`,
      { method: "POST" },
    );
    return product;
  });

export const useCheckLanding = (workspaceId: string, productId: string) =>
  useProductMutation(workspaceId, () =>
    apiFetch<CheckLandingResponse>(
      `${productsApi(workspaceId)}/${productId}/check-landing`,
      { method: "POST" },
    ),
  );
