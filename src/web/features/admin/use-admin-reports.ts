import { useInfiniteQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { PAGINATION, type ErrorSource } from "../../../shared/constants";
import type {
  AdminUsageDto,
  adminErrorsPageSchema,
} from "../../../shared/schemas/admin";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

type ErrorsPage = z.infer<typeof adminErrorsPageSchema>;

function pageQuery(pageParam: string, filters: Record<string, string>) {
  const query = new URLSearchParams({ limit: String(PAGINATION.maxLimit) });
  for (const [name, value] of Object.entries(filters))
    if (value) query.set(name, value);
  if (pageParam) query.set("cursor", pageParam);
  return query;
}

export const useAdminUsage = (month: string) =>
  useInfiniteQuery({
    queryKey: qk.adminUsage(month),
    initialPageParam: "",
    getNextPageParam: (page: AdminUsageDto) => page.nextCursor ?? undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<AdminUsageDto>(
        `/api/admin/usage?${pageQuery(pageParam, { month })}`,
      ),
  });

export const useAdminErrors = (source: ErrorSource | "") =>
  useInfiniteQuery({
    queryKey: qk.adminErrors(source),
    initialPageParam: "",
    getNextPageParam: (page: ErrorsPage) => page.nextCursor ?? undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<ErrorsPage>(
        `/api/admin/errors?${pageQuery(pageParam, { source })}`,
      ),
  });
