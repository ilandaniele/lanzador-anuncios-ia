import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import type { MetricsResponse } from "../../../shared/schemas/metrics";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";
import {
  filtersToParams,
  isRangeComplete,
  type MetricsFilters,
} from "./metrics-filters";

const PAGE_SIZE = 50;

const metricsApi = (workspaceId: string) => `/api/w/${workspaceId}/metrics`;

export const exportCsvUrl = (workspaceId: string, filters: MetricsFilters) =>
  `${metricsApi(workspaceId)}/export.csv?${filtersToParams(filters)}`;

export function useMetrics(workspaceId: string, filters: MetricsFilters) {
  const search = filtersToParams(filters).toString();
  return useInfiniteQuery({
    queryKey: qk.metrics(workspaceId, search),
    enabled: isRangeComplete(filters),
    placeholderData: keepPreviousData,
    initialPageParam: "",
    getNextPageParam: (page: MetricsResponse) => page.nextCursor ?? undefined,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams(search);
      query.set("limit", String(PAGE_SIZE));
      if (pageParam) query.set("cursor", pageParam);
      return apiFetch<MetricsResponse>(`${metricsApi(workspaceId)}?${query}`);
    },
  });
}
