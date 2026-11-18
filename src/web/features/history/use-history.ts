import { useInfiniteQuery } from "@tanstack/react-query";
import { PAGINATION } from "../../../shared/constants";
import type { AuditEntryDto } from "../../../shared/schemas/audit";
import type { LaunchListItemDto } from "../../../shared/schemas/launch";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

type Page<Item> = { data: Item[]; nextCursor: string | null };

export type AuditFilters = { origin: string; actorUserId: string };

function pageUrl(
  path: string,
  filters: Record<string, string>,
  cursor: string,
) {
  const query = new URLSearchParams({ limit: String(PAGINATION.defaultLimit) });
  for (const [name, value] of Object.entries(filters))
    if (value) query.set(name, value);
  if (cursor) query.set("cursor", cursor);
  return `${path}?${query}`;
}

export function useCursorPages<Item>(
  queryKey: readonly unknown[],
  path: string,
  filters: Record<string, string> = {},
) {
  return useInfiniteQuery({
    queryKey,
    initialPageParam: "",
    getNextPageParam: (page: Page<Item>) => page.nextCursor ?? undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<Page<Item>>(pageUrl(path, filters, pageParam)),
  });
}

export const useLaunchHistory = (workspaceId: string) =>
  useCursorPages<LaunchListItemDto>(
    qk.launchHistory(workspaceId),
    `/api/w/${workspaceId}/launches`,
  );

export const useAuditHistory = (workspaceId: string, filters: AuditFilters) =>
  useCursorPages<AuditEntryDto>(
    qk.auditHistory(workspaceId, JSON.stringify(filters)),
    `/api/w/${workspaceId}/audit`,
    filters,
  );
