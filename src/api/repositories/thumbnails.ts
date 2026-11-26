import { and, asc, eq, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { creatives } from "../../db/schema/creatives";
import { metaAssets, metaConnections } from "../../db/schema/meta";
import { workspaces } from "../../db/schema/workspaces";
import { billingAllowed } from "./billing-access";

export const selectStaleThumbnails = (
  db: D1Database,
  { at, refreshedBefore }: { at: number; refreshedBefore: number },
  limit: number,
) =>
  drizzle(db)
    .select({
      id: creatives.id,
      workspaceId: creatives.workspaceId,
      metaVideoId: creatives.metaVideoId,
      metaImageHash: creatives.metaImageHash,
      accountMetaId: metaAssets.metaId,
      connection: {
        id: metaConnections.id,
        workspaceId: metaConnections.workspaceId,
        tokenCiphertext: metaConnections.tokenCiphertext,
        tokenIv: metaConnections.tokenIv,
        tokenKeyVersion: metaConnections.tokenKeyVersion,
      },
    })
    .from(creatives)
    .innerJoin(
      metaAssets,
      and(
        eq(metaAssets.id, creatives.adAccountAssetId),
        eq(metaAssets.workspaceId, creatives.workspaceId),
      ),
    )
    .innerJoin(
      metaConnections,
      and(
        eq(metaConnections.id, metaAssets.connectionId),
        eq(metaConnections.workspaceId, creatives.workspaceId),
      ),
    )
    .innerJoin(workspaces, eq(workspaces.id, creatives.workspaceId))
    .where(
      and(
        eq(creatives.status, "ready"),
        lt(creatives.thumbnailRefreshedAt, refreshedBefore),
        eq(metaConnections.status, "active"),
        eq(workspaces.status, "active"),
        billingAllowed(at),
      ),
    )
    .orderBy(asc(creatives.thumbnailRefreshedAt))
    .limit(limit);

export type StaleThumbnail = Awaited<
  ReturnType<typeof selectStaleThumbnails>
>[number];

export interface RefreshedThumbnail {
  id: string;
  thumbnailUrl: string;
}

const attemptedRow = ({ id, workspaceId }: StaleThumbnail) =>
  and(
    eq(creatives.id, id),
    eq(creatives.workspaceId, workspaceId),
    eq(creatives.status, "ready"),
  );

export async function saveThumbnails(
  db: D1Database,
  attempted: StaleThumbnail[],
  refreshed: RefreshedThumbnail[],
  at: number,
): Promise<void> {
  const orm = drizzle(db);
  const urls = new Map(
    refreshed.map(({ id, thumbnailUrl }) => [id, thumbnailUrl]),
  );
  const [first, ...rest] = attempted.map((row) =>
    orm
      .update(creatives)
      .set({
        thumbnailUrl: urls.get(row.id) ?? sql`${creatives.thumbnailUrl}`,
        thumbnailRefreshedAt: at,
        updatedAt: at,
      })
      .where(attemptedRow(row)),
  );
  if (!first) return;
  await orm.batch([first, ...rest]);
}
