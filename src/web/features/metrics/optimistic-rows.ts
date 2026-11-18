import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type {
  MetricsResponse,
  MetricsRowDto,
} from "../../../shared/schemas/metrics";
import { qk } from "../../lib/query-keys";

type RowPatch = Partial<Pick<MetricsRowDto, "status" | "protected">>;

const isMetricsPages = (data: unknown): data is InfiniteData<MetricsResponse> =>
  typeof data === "object" && data !== null && "pages" in data;

export async function patchRowOptimistically(
  queryClient: QueryClient,
  workspaceId: string,
  rowId: string,
  patch: RowPatch,
): Promise<() => void> {
  const filter = { queryKey: qk.metricsAll(workspaceId) };
  await queryClient.cancelQueries(filter);
  const snapshots = queryClient.getQueriesData(filter);
  queryClient.setQueriesData(filter, (data) =>
    isMetricsPages(data)
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            data: page.data.map((row) =>
              row.id === rowId ? { ...row, ...patch } : row,
            ),
          })),
        }
      : data,
  );
  return () =>
    snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
}
