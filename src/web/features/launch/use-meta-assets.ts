import { useQuery } from "@tanstack/react-query";
import { PAGINATION } from "../../../shared/constants";
import type {
  AssetDto,
  assetsListResponseSchema,
} from "../../../shared/schemas/meta-connections";
import type { z } from "zod";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

type AssetsPage = z.infer<typeof assetsListResponseSchema>;

async function fetchEnabledAssets(workspaceId: string): Promise<AssetDto[]> {
  const assets: AssetDto[] = [];
  let cursor: string | null = "";
  while (cursor !== null) {
    const query = new URLSearchParams({
      enabled: "true",
      limit: String(PAGINATION.maxLimit),
    });
    if (cursor) query.set("cursor", cursor);
    const page: AssetsPage = await apiFetch<AssetsPage>(
      `/api/w/${workspaceId}/meta/assets?${query}`,
    );
    assets.push(...page.data);
    cursor = page.nextCursor;
  }
  return assets;
}

export const useMetaAssets = (workspaceId: string) =>
  useQuery({
    queryKey: qk.metaAssets(workspaceId),
    queryFn: () => fetchEnabledAssets(workspaceId),
  });
