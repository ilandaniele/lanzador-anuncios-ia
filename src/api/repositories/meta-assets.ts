import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { metaAssets, metaConnections } from "../../db/schema/meta";
import type { ConnectionStatus } from "../../shared/constants";
import type { DiscoveredAsset } from "../integrations/meta/read";
import { newId } from "../lib/ids";
import { inWorkspace, type Scope } from "./scope";

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
