import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { insightsCache } from "../../db/schema/pilot";
import { newId } from "../lib/ids";
import { inWorkspace, type Scope } from "./scope";

export const INSIGHT_CACHE_LEVELS = [
  "account",
  "campaign",
  "adset",
  "ad",
  "health",
  "issues",
] as const;
export type InsightCacheLevel = (typeof INSIGHT_CACHE_LEVELS)[number];

export interface InsightsCacheKey {
  adAccountAssetId: string;
  level: InsightCacheLevel;
  rangeKey: string;
}

export interface CacheWindow {
  dateFrom: string;
  dateTo: string;
}

export interface InsightsBlob extends CacheWindow {
  rows: unknown[];
  fetchedAt: number;
  expiresAt: number;
}

export interface CachedInsightsQuery {
  adAccountAssetIds: string[];
  levels: InsightCacheLevel[];
  rangeKeys: string[];
}

export interface CachedInsights extends InsightsCacheKey, CacheWindow {
  rows: unknown[];
  updatedAt: number;
  stale: boolean;
  lastError: string | null;
}

const NEVER_FETCHED = 0;

const byKey = (scope: Scope, key: InsightsCacheKey) =>
  and(
    inWorkspace(insightsCache, scope),
    eq(insightsCache.adAccountAssetId, key.adAccountAssetId),
    eq(insightsCache.level, key.level),
    eq(insightsCache.rangeKey, key.rangeKey),
  );

export async function acquireRefreshLease(
  db: D1Database,
  scope: Scope,
  key: InsightsCacheKey,
  window: CacheWindow,
  lease: { at: number; until: number },
): Promise<boolean> {
  const [row] = await drizzle(db)
    .insert(insightsCache)
    .values({
      ...key,
      ...window,
      id: newId(),
      workspaceId: scope.workspaceId,
      payload: "[]",
      fetchedAt: NEVER_FETCHED,
      expiresAt: NEVER_FETCHED,
      refreshingUntil: lease.until,
    })
    .onConflictDoUpdate({
      target: [
        insightsCache.workspaceId,
        insightsCache.adAccountAssetId,
        insightsCache.level,
        insightsCache.rangeKey,
      ],
      set: { refreshingUntil: lease.until },
      setWhere: and(
        lte(insightsCache.expiresAt, lease.at),
        or(
          isNull(insightsCache.refreshingUntil),
          lte(insightsCache.refreshingUntil, lease.at),
        ),
      ),
    })
    .returning({ id: insightsCache.id });
  return row !== undefined;
}

export async function storeInsights(
  db: D1Database,
  scope: Scope,
  key: InsightsCacheKey,
  blob: InsightsBlob,
): Promise<void> {
  await drizzle(db)
    .update(insightsCache)
    .set({
      dateFrom: blob.dateFrom,
      dateTo: blob.dateTo,
      payload: JSON.stringify(blob.rows),
      rowCount: blob.rows.length,
      fetchedAt: blob.fetchedAt,
      expiresAt: blob.expiresAt,
      refreshingUntil: null,
      lastError: null,
    })
    .where(byKey(scope, key));
}

export async function recordRefreshError(
  db: D1Database,
  scope: Scope,
  key: InsightsCacheKey,
  lastError: string,
): Promise<void> {
  await drizzle(db)
    .update(insightsCache)
    .set({ lastError, refreshingUntil: null })
    .where(byKey(scope, key));
}

export async function readCachedInsights(
  db: D1Database,
  scope: Scope,
  query: CachedInsightsQuery,
  at: number,
): Promise<CachedInsights[]> {
  const rows = await drizzle(db)
    .select({
      adAccountAssetId: insightsCache.adAccountAssetId,
      level: insightsCache.level,
      rangeKey: insightsCache.rangeKey,
      dateFrom: insightsCache.dateFrom,
      dateTo: insightsCache.dateTo,
      payload: insightsCache.payload,
      fetchedAt: insightsCache.fetchedAt,
      expiresAt: insightsCache.expiresAt,
      lastError: insightsCache.lastError,
    })
    .from(insightsCache)
    .where(
      and(
        inWorkspace(insightsCache, scope),
        inArray(insightsCache.adAccountAssetId, query.adAccountAssetIds),
        inArray(insightsCache.level, query.levels),
        inArray(insightsCache.rangeKey, query.rangeKeys),
        gt(insightsCache.fetchedAt, NEVER_FETCHED),
      ),
    );
  return rows.map(({ payload, fetchedAt, expiresAt, level, ...row }) => ({
    ...row,
    level: level as InsightCacheLevel,
    rows: JSON.parse(payload) as unknown[],
    updatedAt: fetchedAt,
    stale: row.lastError !== null || expiresAt <= at,
  }));
}
