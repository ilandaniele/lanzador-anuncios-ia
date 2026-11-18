import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { creatives } from "../../db/schema/creatives";
import { launchItems } from "../../db/schema/launches";
import { launchMediaColumns } from "./creatives";
import { inWorkspace, type Scope } from "./scope";

export async function findLaunchItem(
  db: D1Database,
  scope: Scope,
  launchId: string,
  itemId: string,
) {
  const [row] = await drizzle(db)
    .select({
      id: launchItems.id,
      adName: launchItems.adName,
      cloneStoryId: launchItems.cloneStoryId,
      metaCreativeId: launchItems.metaCreativeId,
      ...launchMediaColumns,
    })
    .from(launchItems)
    .leftJoin(
      creatives,
      and(
        eq(creatives.id, launchItems.creativeId),
        eq(creatives.workspaceId, launchItems.workspaceId),
      ),
    )
    .where(
      and(
        inWorkspace(launchItems, scope),
        eq(launchItems.launchId, launchId),
        eq(launchItems.id, itemId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type LaunchItem = NonNullable<
  Awaited<ReturnType<typeof findLaunchItem>>
>;
