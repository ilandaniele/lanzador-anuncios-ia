import { and, eq, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { launchItems, launches } from "../../db/schema/launches";
import type {
  LaunchItemStatus,
  LaunchPhase,
  LaunchStatus,
} from "../../shared/schemas/launch";
import { inWorkspace, type Scope } from "./scope";

export async function findLaunchProgress(
  db: D1Database,
  scope: Scope,
  id: string,
  since?: number,
) {
  const orm = drizzle(db);
  const [[launch], items] = await orm.batch([
    orm
      .select({
        status: sql<LaunchStatus>`${launches.status}`,
        phase: sql<LaunchPhase | null>`${launches.phase}`,
        itemsTotal: launches.itemsTotal,
        itemsDone: launches.itemsDone,
        itemsFailed: launches.itemsFailed,
        checks: launches.checks,
        updatedAt: launches.updatedAt,
      })
      .from(launches)
      .where(and(inWorkspace(launches, scope), eq(launches.id, id)))
      .limit(1),
    orm
      .select({
        id: launchItems.id,
        position: launchItems.position,
        status: sql<LaunchItemStatus>`${launchItems.status}`,
        adName: launchItems.adName,
        metaAdId: launchItems.metaAdId,
        errorMessage: launchItems.errorMessage,
        updatedAt: launchItems.updatedAt,
      })
      .from(launchItems)
      .where(
        and(
          inWorkspace(launchItems, scope),
          eq(launchItems.launchId, id),
          since === undefined ? undefined : gte(launchItems.updatedAt, since),
        ),
      )
      .orderBy(launchItems.position),
  ]);
  return launch ? { launch, items } : null;
}

export type LaunchProgressRows = NonNullable<
  Awaited<ReturnType<typeof findLaunchProgress>>
>;
