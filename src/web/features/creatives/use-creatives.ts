import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";
import { PAGINATION } from "../../../shared/constants";
import type {
  CreativeDto,
  CreativeTags,
  creativesPageSchema,
} from "../../../shared/schemas/creatives";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";
import type { CreativeFilters } from "./creative-filters";

type CreativesPage = z.infer<typeof creativesPageSchema>;

const creativesApi = (workspaceId: string) => `/api/w/${workspaceId}/creatives`;

const listQuery = ({ adAccountAssetId, tag, sort }: CreativeFilters) => {
  const query = new URLSearchParams({
    adAccountAssetId,
    sort,
    limit: String(PAGINATION.maxLimit),
  });
  if (tag) query.set("tag", tag);
  return query;
};

export const useCreatives = (workspaceId: string, filters: CreativeFilters) => {
  const query = listQuery(filters);
  return useInfiniteQuery({
    queryKey: qk.creativeList(workspaceId, query.toString()),
    enabled: filters.adAccountAssetId !== "",
    initialPageParam: "",
    getNextPageParam: (page: CreativesPage) => page.nextCursor ?? undefined,
    queryFn: ({ pageParam }) => {
      const pageQuery = new URLSearchParams(query);
      if (pageParam) pageQuery.set("cursor", pageParam);
      return apiFetch<CreativesPage>(
        `${creativesApi(workspaceId)}?${pageQuery}`,
      );
    },
  });
};

function useCreativeMutation<Input, Output>(
  workspaceId: string,
  send: (input: Input) => Promise<Output>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: qk.creativeLists(workspaceId),
      }),
  });
}

export const useSaveCreativeTags = (workspaceId: string, creativeId: string) =>
  useCreativeMutation(workspaceId, async (tags: CreativeTags) => {
    const { creative } = await apiFetch<{ creative: CreativeDto }>(
      `${creativesApi(workspaceId)}/${creativeId}`,
      { method: "PATCH", body: { tags } },
    );
    return creative;
  });

export const useRetagCreative = (workspaceId: string, creativeId: string) =>
  useCreativeMutation(workspaceId, () =>
    apiFetch(`${creativesApi(workspaceId)}/${creativeId}/retag`, {
      method: "POST",
    }),
  );
