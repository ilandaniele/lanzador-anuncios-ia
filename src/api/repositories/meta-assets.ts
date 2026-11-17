import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { metaAssets, metaConnections } from "../../db/schema/meta";
import type { ConnectionStatus } from "../../shared/constants";
import { inWorkspace, type Scope } from "./scope";

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
