import type { QueryClient } from "@tanstack/react-query";
import { metaAssetsQueryOptions } from "../features/launch/use-meta-assets";
import { workspaceOverviewQueryOptions } from "../features/settings/use-workspace-settings";
import { todayQueryOptions } from "../features/today/use-today";

const HOY_PATH = /^\/w\/([^/]+)\/hoy\/?$/;

export function prefetchLanding(queryClient: QueryClient, pathname: string) {
  const workspaceId = HOY_PATH.exec(pathname)?.[1];
  if (!workspaceId) return;
  void queryClient.prefetchQuery(todayQueryOptions(workspaceId));
  void queryClient.prefetchQuery(metaAssetsQueryOptions(workspaceId));
  void queryClient.prefetchQuery(workspaceOverviewQueryOptions(workspaceId));
}
