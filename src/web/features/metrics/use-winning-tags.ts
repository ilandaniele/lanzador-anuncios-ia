import { useQuery } from "@tanstack/react-query";
import type {
  TagDimension,
  WinningTagsResponse,
} from "../../../shared/schemas/metrics";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";
import {
  isRangeComplete,
  rangeToParams,
  type MetricsFilters,
} from "./metrics-filters";

export function useWinningTags(
  workspaceId: string,
  filters: MetricsFilters,
  dimension: TagDimension,
) {
  const params = rangeToParams(filters);
  params.set("dimension", dimension);
  const search = params.toString();
  return useQuery({
    queryKey: qk.winningTags(workspaceId, search),
    enabled: isRangeComplete(filters),
    queryFn: () =>
      apiFetch<WinningTagsResponse>(
        `/api/w/${workspaceId}/metrics/winning-tags?${search}`,
      ),
  });
}
