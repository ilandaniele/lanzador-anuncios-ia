import { useQuery } from "@tanstack/react-query";
import type { TopAdsResponse } from "../../../shared/schemas/metrics";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";
import {
  isRangeComplete,
  rangeToParams,
  type MetricsFilters,
} from "./metrics-filters";

export function useTopAds(workspaceId: string, filters: MetricsFilters) {
  const search = rangeToParams(filters).toString();
  return useQuery({
    queryKey: qk.topAds(workspaceId, search),
    enabled: isRangeComplete(filters),
    queryFn: () =>
      apiFetch<TopAdsResponse>(
        `/api/w/${workspaceId}/metrics/top-ads?${search}`,
      ),
  });
}
