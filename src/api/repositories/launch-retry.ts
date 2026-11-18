import { and, eq, exists, gt, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { launchItems, launches } from "../../db/schema/launches";
import { RETRYABLE_LAUNCH_STATUSES } from "../../shared/launch-status";
import type { LaunchStatus } from "../../shared/schemas/launch";
import { now } from "../lib/time";
import { inWorkspace, type Scope } from "./scope";

export interface RetryAttempt {
  fromAttempt: number;
  workflowInstanceId: string;
}

export async function findLaunchForRetry(
  db: D1Database,
  scope: Scope,
  id: string,
) {
  const [row] = await drizzle(db)
    .select({
      status: launches.status,
      attempt: launches.attempt,
      itemsFailed: launches.itemsFailed,
    })
    .from(launches)
    .where(and(inWorkspace(launches, scope), eq(launches.id, id)))
    .limit(1);
  return row ? { ...row, status: row.status as LaunchStatus } : null;
}

export async function requeueFailedItems(
  db: D1Database,
  scope: Scope,
  id: string,
  { fromAttempt, workflowInstanceId }: RetryAttempt,
) {
  const orm = drizzle(db);
  const at = now();
  const retryable = and(
    inWorkspace(launches, scope),
    eq(launches.id, id),
    eq(launches.attempt, fromAttempt),
    inArray(launches.status, RETRYABLE_LAUNCH_STATUSES),
    gt(launches.itemsFailed, 0),
  );
  const [, requeued] = await orm.batch([
    orm
      .update(launchItems)
      .set({
        status: "pending",
        errorCode: null,
        errorMessage: null,
        updatedAt: at,
      })
      .where(
        and(
          inWorkspace(launchItems, scope),
          eq(launchItems.launchId, id),
          eq(launchItems.status, "failed"),
          exists(
            orm.select({ id: launches.id }).from(launches).where(retryable),
          ),
        ),
      ),
    orm
      .update(launches)
      .set({
        status: "queued",
        phase: "preflight",
        attempt: fromAttempt + 1,
        workflowInstanceId,
        itemsFailed: 0,
        errorCode: null,
        errorMessage: null,
        finishedAt: null,
        updatedAt: at,
      })
      .where(retryable)
      .returning({ id: launches.id }),
  ]);
  return requeued.length === 1;
}
