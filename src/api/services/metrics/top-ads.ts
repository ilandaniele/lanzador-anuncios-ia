import type { TopAdDto, TopAdsQuery } from "../../../shared/schemas/metrics";
import type { Env } from "../../env";
import {
  type AdCreativeInfo,
  getAdCreatives,
} from "../../integrations/meta/read";
import { groupBy } from "../../lib/group-by";
import { now } from "../../lib/time";
import type { Scope } from "../../repositories/scope";
import { getGraphForAsset } from "../meta/connection";
import { loadAdRows } from "./ad-rows";
import type { MetricsRow } from "./aggregate";

const byRoasThenSpend = (a: MetricsRow, b: MetricsRow) =>
  (b.roas ?? 0) - (a.roas ?? 0) ||
  b.spendMinor - a.spendMinor ||
  a.id.localeCompare(b.id);

async function creativesByAd(
  env: Env,
  scope: Scope,
  ads: MetricsRow[],
): Promise<Map<string, AdCreativeInfo>> {
  const adsByAccount = groupBy(ads, ({ adAccountId }) => adAccountId);
  const lists = await Promise.all(
    [...adsByAccount].map(async ([assetId, accountAds]) => {
      const { graph, asset } = await getGraphForAsset(
        env.DB,
        env,
        scope,
        assetId,
      );
      return getAdCreatives(
        graph,
        asset.metaId,
        accountAds.map(({ id }) => id),
      );
    }),
  );
  return new Map(lists.flat().map((info) => [info.adId, info]));
}

export async function topAds(
  env: Env,
  scope: Scope,
  { range, minSpendMinor, limit }: TopAdsQuery,
  at: number = now(),
): Promise<{ data: TopAdDto[] }> {
  const rows = await loadAdRows(env, scope, range, at);
  const top = rows
    .filter((row) => row.roas !== null && row.spendMinor >= minSpendMinor)
    .sort(byRoasThenSpend)
    .slice(0, limit);
  const creatives = await creativesByAd(env, scope, top).catch(
    () => new Map<string, AdCreativeInfo>(),
  );
  return {
    data: top.map((row) => ({
      adId: row.id,
      name: row.name,
      adAccountId: row.adAccountId,
      currency: row.currency,
      storyId: creatives.get(row.id)?.storyId ?? null,
      thumbnailUrl: creatives.get(row.id)?.thumbnailUrl ?? null,
      spendMinor: row.spendMinor,
      roas: row.roas,
      purchases: row.purchases,
    })),
  };
}
