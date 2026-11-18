import type { Env } from "../../env";
import {
  type CachedInsights,
  type InsightsCacheKey,
  readCachedInsights,
} from "../../repositories/insights-cache";
import type { Scope } from "../../repositories/scope";
import { refreshInsights } from "../insights/refresh";

const MAX_INSIGHTS_AGE_MS = 15 * 60_000;

export type FreshInsights = (
  key: InsightsCacheKey,
) => CachedInsights | undefined;

const entryId = ({ adAccountAssetId, level, rangeKey }: InsightsCacheKey) =>
  `${adAccountAssetId}|${level}|${rangeKey}`;

const unique = <Item>(items: Item[]) => [...new Set(items)];

const isFresh = (entry: CachedInsights, at: number) =>
  entry.lastError === null && at - entry.updatedAt <= MAX_INSIGHTS_AGE_MS;

async function readFresh(
  env: Env,
  scope: Scope,
  keys: InsightsCacheKey[],
  at: number,
) {
  const entries = await readCachedInsights(
    env.DB,
    scope,
    {
      adAccountAssetIds: unique(keys.map((key) => key.adAccountAssetId)),
      levels: unique(keys.map((key) => key.level)),
      rangeKeys: unique(keys.map((key) => key.rangeKey)),
    },
    at,
  );
  return new Map(
    entries
      .filter((entry) => isFresh(entry, at))
      .map((entry) => [entryId(entry), entry]),
  );
}

export async function loadFreshInsights(
  env: Env,
  scope: Scope,
  keys: InsightsCacheKey[],
  at: number,
): Promise<FreshInsights> {
  if (keys.length === 0) return () => undefined;
  const found = await readFresh(env, scope, keys, at);
  const outdated = keys.filter((key) => !found.has(entryId(key)));
  const fresh =
    outdated.length === 0
      ? found
      : await Promise.all(
          outdated.map((key) =>
            refreshInsights(env, scope, key, at, { force: true }).catch(
              () => false,
            ),
          ),
        ).then(() => readFresh(env, scope, keys, at));
  return (key) => fresh.get(entryId(key));
}
