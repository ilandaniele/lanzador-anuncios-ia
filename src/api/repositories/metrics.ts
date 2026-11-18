import { and, asc, eq, isNotNull, type SQL, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { creatives } from "../../db/schema/creatives";
import { launches, launchItems } from "../../db/schema/launches";
import { metaAssets } from "../../db/schema/meta";
import { auditLog } from "../../db/schema/ops";
import { protectedCampaigns } from "../../db/schema/pilot";
import type { TagDimension } from "../../shared/schemas/metrics";
import { newId } from "../lib/ids";
import { inWorkspace, type Scope } from "./scope";

const MAX_METRICS_ACCOUNTS = 100;
export const SCALE_ACTION = "meta.budget.scale";
export const REFRESH_ACTION = "metrics.refresh";

const inJsonList = (column: SQLiteColumn, values: string[]): SQL =>
  sql`${column} in (select value from json_each(${JSON.stringify(values)}))`;

const TAG_COLUMNS = {
  hook: creatives.tagHook,
  angle: creatives.tagAngle,
  format: creatives.tagFormat,
  language: creatives.tagLanguage,
  onScreenText: creatives.tagOnScreenText,
} as const;

export const selectMetricsAccounts = (db: D1Database, scope: Scope) =>
  drizzle(db)
    .select({
      id: metaAssets.id,
      metaId: metaAssets.metaId,
      name: metaAssets.name,
      currency: metaAssets.currency,
      timezoneName: metaAssets.timezoneName,
    })
    .from(metaAssets)
    .where(
      and(
        inWorkspace(metaAssets, scope),
        eq(metaAssets.kind, "ad_account"),
        eq(metaAssets.enabled, 1),
      ),
    )
    .orderBy(asc(metaAssets.name), asc(metaAssets.id))
    .limit(MAX_METRICS_ACCOUNTS);

export interface MetricsObjectIds {
  objectIds: string[];
  campaignIds: string[];
}

export async function selectMetricsContextRows(
  db: D1Database,
  scope: Scope,
  { objectIds, campaignIds }: MetricsObjectIds,
) {
  const orm = drizzle(db);
  const [launchRows, scaleRows, protectedRows] = await orm.batch([
    orm
      .select({
        campaignId: launches.metaCampaignId,
        productId: launches.productId,
      })
      .from(launches)
      .where(
        and(
          inWorkspace(launches, scope),
          isNotNull(launches.productId),
          inJsonList(launches.metaCampaignId, campaignIds),
        ),
      )
      .orderBy(asc(launches.createdAt)),
    orm
      .select({
        objectId: auditLog.objectMetaId,
        at: sql<number>`max(${auditLog.createdAt})`,
      })
      .from(auditLog)
      .where(
        and(
          inWorkspace(auditLog, scope),
          eq(auditLog.action, SCALE_ACTION),
          eq(auditLog.result, "ok"),
          inJsonList(auditLog.objectMetaId, objectIds),
        ),
      )
      .groupBy(auditLog.objectMetaId),
    orm
      .select({ campaignId: protectedCampaigns.campaignMetaId })
      .from(protectedCampaigns)
      .where(
        and(
          inWorkspace(protectedCampaigns, scope),
          inJsonList(protectedCampaigns.campaignMetaId, campaignIds),
        ),
      ),
  ]);
  return { launchRows, scaleRows, protectedRows };
}

export const selectAdTags = (
  db: D1Database,
  scope: Scope,
  adIds: string[],
  dimension: TagDimension,
) =>
  drizzle(db)
    .select({ adId: launchItems.metaAdId, value: TAG_COLUMNS[dimension] })
    .from(launchItems)
    .innerJoin(creatives, eq(creatives.id, launchItems.creativeId))
    .where(
      and(
        inWorkspace(launchItems, scope),
        inWorkspace(creatives, scope),
        inJsonList(launchItems.metaAdId, adIds),
        isNotNull(TAG_COLUMNS[dimension]),
      ),
    );

export async function claimMetricsRefresh(
  db: D1Database,
  scope: Scope,
  claim: { requestId: string; at: number; since: number },
): Promise<boolean> {
  const inserted = await drizzle(db).get<{ id: string }>(
    sql`INSERT INTO ${auditLog}
        (id, workspace_id, actor_user_id, actor_type, origin, action, result, request_id, created_at)
      SELECT ${newId()}, ${scope.workspaceId}, ${scope.userId}, 'user', 'manual',
        ${REFRESH_ACTION}, 'ok', ${claim.requestId}, ${claim.at}
      WHERE NOT EXISTS (SELECT 1 FROM ${auditLog}
        WHERE ${auditLog.workspaceId} = ${scope.workspaceId}
          AND ${auditLog.action} = ${REFRESH_ACTION}
          AND ${auditLog.createdAt} > ${claim.since})
      RETURNING id`,
  );
  return inserted !== undefined;
}
