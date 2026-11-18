import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PAGINATION } from "../../../shared/constants";
import type { CreativeDto } from "../../../shared/schemas/creatives";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";
import { isMetaInProgressStatus } from "./upload-item";

export const CREATIVE_POLL_MS = 3000;

export const useCreativeStatuses = (
  workspaceId: string,
  ids: string[],
  intervalMs: number,
) =>
  useQuery({
    queryKey: qk.creativesByIds(workspaceId, ids),
    enabled: ids.length > 0,
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.some((creative) =>
        isMetaInProgressStatus(creative.status),
      ) === false
        ? false
        : intervalMs,
    queryFn: async () =>
      (
        await apiFetch<{ data: CreativeDto[] }>(
          `/api/w/${workspaceId}/creatives?ids=${ids.join(",")}&limit=${PAGINATION.maxLimit}`,
        )
      ).data,
  });
