import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { creatives } from "../../db/schema/creatives";
import { launchItems, launches } from "../../db/schema/launches";
import type {
  LaunchCheck,
  LaunchItemStatus,
  LaunchStatus,
} from "../../shared/schemas/launch";
import { now } from "../lib/time";
import { inWorkspace, type Scope } from "./scope";

export interface Verification {
  attempt: number;
  fromStatuses: readonly LaunchStatus[];
  status: LaunchStatus;
  checks: LaunchCheck[];
  checksOk: boolean;
}

const launchById = (scope: Scope, id: string) =>
  and(inWorkspace(launches, scope), eq(launches.id, id));

export async function findLaunchForVerify(
  db: D1Database,
  scope: Scope,
  id: string,
) {
  const orm = drizzle(db);
  const [[launch], items] = await orm.batch([
    orm
      .select({
        status: sql<LaunchStatus>`${launches.status}`,
        attempt: launches.attempt,
        draft: launches.draft,
        metaCampaignId: launches.metaCampaignId,
        metaAdsetId: launches.metaAdsetId,
        itemsFailed: launches.itemsFailed,
      })
      .from(launches)
      .where(launchById(scope, id))
      .limit(1),
    orm
      .select({
        status: sql<LaunchItemStatus>`${launchItems.status}`,
        cloneStoryId: launchItems.cloneStoryId,
        metaVideoId: creatives.metaVideoId,
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
        and(inWorkspace(launchItems, scope), eq(launchItems.launchId, id)),
      ),
  ]);
  return launch ? { ...launch, items } : null;
}

export type LaunchForVerify = NonNullable<
  Awaited<ReturnType<typeof findLaunchForVerify>>
>;

export async function saveVerification(
  db: D1Database,
  scope: Scope,
  id: string,
  { attempt, fromStatuses, status, checks, checksOk }: Verification,
) {
  const at = now();
  const rows = await drizzle(db)
    .update(launches)
    .set({
      status,
      phase: "verify",
      checks: JSON.stringify(checks),
      checksOk: checksOk ? 1 : 0,
      finishedAt: at,
      updatedAt: at,
    })
    .where(
      and(
        launchById(scope, id),
        eq(launches.attempt, attempt),
        inArray(launches.status, [...fromStatuses]),
      ),
    )
    .returning({ id: launches.id });
  return rows.length === 1;
}
