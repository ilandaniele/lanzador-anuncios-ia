import {
  type CachedInsights,
  type InsightsCacheKey,
  readCachedInsights,
} from "../../repositories/insights-cache";
import type { Env } from "../../env";
import type { Scope } from "../../repositories/scope";
import { refreshInsights } from "../insights/refresh";
import type { AccountInsights } from "./aggregate";
import type { MetricsAccount } from "./accounts";

export type CachedSet = ReadonlyMap<string, CachedInsights>;

const entryId = ({ adAccountAssetId, level, rangeKey }: InsightsCacheKey) =>
  `${adAccountAssetId}|${level}|${rangeKey}`;

const unique = <Item>(items: Item[]) => [...new Set(items)];

export async function loadCached(
  env: Env,
  scope: Scope,
  keys: InsightsCacheKey[],
  at: number,
): Promise<CachedSet> {
  if (keys.length === 0) return new Map();
  const read = async () =>
    new Map(
      (
        await readCachedInsights(
          env.DB,
          scope,
          {
            adAccountAssetIds: unique(keys.map((key) => key.adAccountAssetId)),
            levels: unique(keys.map((key) => key.level)),
            rangeKeys: unique(keys.map((key) => key.rangeKey)),
          },
          at,
        )
      ).map((entry) => [entryId(entry), entry]),
    );
  const found = await read();
  const pending = keys.filter(
    (key) => found.get(entryId(key))?.stale !== false,
  );
  if (pending.length === 0) return found;
  await Promise.all(
    pending.map((key) =>
      refreshInsights(env, scope, key, at).catch(() => false),
    ),
  );
  return read();
}

export const cachedEntry = (cached: CachedSet, key: InsightsCacheKey) =>
  cached.get(entryId(key));

export const toAccountInsights = (
  account: MetricsAccount,
  entry: CachedInsights | undefined,
): AccountInsights[] =>
  entry
    ? [
        {
          adAccountId: account.id,
          currency: account.currency,
          rows: entry.rows,
        },
      ]
    : [];
