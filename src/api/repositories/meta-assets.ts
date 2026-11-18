import { and, asc, eq, gt, isNotNull, ne, or, sql } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { metaAssets, metaConnections } from "../../db/schema/meta";
import { plans } from "../../db/schema/auth";
import { workspaces } from "../../db/schema/workspaces";
import type { AssetKind, ConnectionStatus } from "../../shared/constants";
import type { DiscoveredAsset } from "../integrations/meta/read";
import { newId } from "../lib/ids";
import { type AuditEntry, auditStatement } from "./audit";
import { inWorkspace, type Scope } from "./scope";

const assetColumns = {
  id: metaAssets.id,
  kind: sql<AssetKind>`${metaAssets.kind}`,
  metaId: metaAssets.metaId,
  name: metaAssets.name,
  parentMetaId: metaAssets.parentMetaId,
  currency: metaAssets.currency,
  enabled: metaAssets.enabled,
  accountStatus: metaAssets.accountStatus,
  disableReason: metaAssets.disableReason,
  fundingOk: metaAssets.fundingOk,
  spendCapPct: metaAssets.spendCapPct,
  healthCheckedAt: metaAssets.healthCheckedAt,
};

const ownerIsInactive = sql`${metaAssets.connectionId} in (select ${metaConnections.id} from ${metaConnections} where ${ne(metaConnections.status, "active")})`;

const mayClaimAsset = (connectionId: string) =>
  or(
    eq(metaAssets.connectionId, connectionId),
    isNotNull(metaAssets.missingSince),
    ownerIsInactive,
  );

export const assetSyncStatements = (
  orm: DrizzleD1Database,
  scope: Scope,
  connectionId: string,
  assets: DiscoveredAsset[],
  at: number,
) =>
  [
    orm
      .update(metaAssets)
      .set({ missingSince: sql`coalesce(${metaAssets.missingSince}, ${at})` })
      .where(
        and(
          inWorkspace(metaAssets, scope),
          eq(metaAssets.connectionId, connectionId),
        ),
      ),
    ...assets.map((asset) =>
      orm
        .insert(metaAssets)
        .values({
          ...asset,
          id: newId(),
          workspaceId: scope.workspaceId,
          connectionId,
          createdAt: at,
          updatedAt: at,
        })
        .onConflictDoUpdate({
          target: [metaAssets.workspaceId, metaAssets.kind, metaAssets.metaId],
          setWhere: mayClaimAsset(connectionId),
          set: {
            connectionId,
            name: asset.name,
            parentMetaId: asset.parentMetaId,
            currency: asset.currency,
            timezoneName: asset.timezoneName,
            accountStatus: asset.accountStatus,
            missingSince: null,
            updatedAt: at,
          },
        }),
    ),
  ] as const;

export async function syncDiscoveredAssets(
  db: D1Database,
  scope: Scope,
  connectionId: string,
  assets: DiscoveredAsset[],
  at: number,
) {
  const orm = drizzle(db);
  await orm.batch(assetSyncStatements(orm, scope, connectionId, assets, at));
}

export async function findEnabledAdAccount(
  db: D1Database,
  scope: Scope,
  assetId: string,
) {
  const [row] = await drizzle(db)
    .select({
      asset: {
        id: metaAssets.id,
        metaId: metaAssets.metaId,
        name: metaAssets.name,
        currency: metaAssets.currency,
        timezoneName: metaAssets.timezoneName,
        accountStatus: metaAssets.accountStatus,
      },
      connection: {
        id: metaConnections.id,
        status: sql<ConnectionStatus>`${metaConnections.status}`,
        tokenCiphertext: metaConnections.tokenCiphertext,
        tokenIv: metaConnections.tokenIv,
        tokenKeyVersion: metaConnections.tokenKeyVersion,
      },
    })
    .from(metaAssets)
    .innerJoin(metaConnections, eq(metaConnections.id, metaAssets.connectionId))
    .where(
      and(
        inWorkspace(metaAssets, scope),
        inWorkspace(metaConnections, scope),
        eq(metaAssets.id, assetId),
        eq(metaAssets.kind, "ad_account"),
        eq(metaAssets.enabled, 1),
      ),
    )
    .limit(1);
  return row ?? null;
}

const inIdList = (ids: string[]) =>
  sql`${metaAssets.id} in (select value from json_each(${JSON.stringify(ids)}))`;

const afterPosition = ({ id, sortValue }: { id: string; sortValue: string }) =>
  or(
    gt(metaAssets.name, sortValue),
    and(eq(metaAssets.name, sortValue), gt(metaAssets.id, id)),
  );

export type AssetListQuery = {
  kind?: AssetKind;
  enabled?: boolean;
  after?: { id: string; sortValue: string };
  size: number;
};

export const selectAssets = (
  db: D1Database,
  scope: Scope,
  { kind, enabled, after, size }: AssetListQuery,
) =>
  drizzle(db)
    .select(assetColumns)
    .from(metaAssets)
    .where(
      and(
        inWorkspace(metaAssets, scope),
        kind ? eq(metaAssets.kind, kind) : undefined,
        enabled === undefined
          ? undefined
          : eq(metaAssets.enabled, enabled ? 1 : 0),
        after ? afterPosition(after) : undefined,
      ),
    )
    .orderBy(asc(metaAssets.name), asc(metaAssets.id))
    .limit(size + 1);

export type AssetRow = Awaited<ReturnType<typeof selectAssets>>[number];

export const selectConnectionAssets = (
  db: D1Database,
  scope: Scope,
  connectionId: string,
) =>
  drizzle(db)
    .select(assetColumns)
    .from(metaAssets)
    .where(
      and(
        inWorkspace(metaAssets, scope),
        eq(metaAssets.connectionId, connectionId),
      ),
    )
    .orderBy(asc(metaAssets.name), asc(metaAssets.id));

export async function selectAssetsWithQuota(
  db: D1Database,
  scope: Scope,
  ids: string[],
) {
  const orm = drizzle(db);
  const [assets, [quota]] = await orm.batch([
    orm
      .select({
        id: metaAssets.id,
        kind: assetColumns.kind,
        enabled: metaAssets.enabled,
      })
      .from(metaAssets)
      .where(and(inWorkspace(metaAssets, scope), inIdList(ids))),
    orm
      .select({
        max: plans.maxAdAccounts,
        enabledAdAccounts: sql<number>`(select count(*) from ${metaAssets} where ${inWorkspace(metaAssets, scope)} and ${metaAssets.kind} = 'ad_account' and ${metaAssets.enabled} = 1)`,
      })
      .from(workspaces)
      .innerJoin(plans, eq(plans.id, workspaces.planId))
      .where(eq(workspaces.id, scope.workspaceId))
      .limit(1),
  ]);
  return { assets, quota: quota ?? null };
}

const setEnabled = (
  orm: DrizzleD1Database,
  scope: Scope,
  ids: string[],
  enabled: boolean,
  at: number,
) =>
  orm
    .update(metaAssets)
    .set({ enabled: enabled ? 1 : 0, updatedAt: at })
    .where(and(inWorkspace(metaAssets, scope), inIdList(ids)))
    .returning(assetColumns);

export async function applyEnabledChanges(
  db: D1Database,
  scope: Scope,
  changes: { enabledIds: string[]; disabledIds: string[] },
  audit: AuditEntry,
  at: number,
): Promise<AssetRow[]> {
  const orm = drizzle(db);
  const [enabled, disabled] = await orm.batch([
    setEnabled(orm, scope, changes.enabledIds, true, at),
    setEnabled(orm, scope, changes.disabledIds, false, at),
    auditStatement(db, audit),
  ]);
  return [...enabled, ...disabled];
}
