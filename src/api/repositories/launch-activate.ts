import { and, eq, isNotNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { launchItems, launches } from "../../db/schema/launches";
import type { LaunchStatus } from "../../shared/schemas/launch";
import { now } from "../lib/time";
import { type AuditEntry, auditStatement } from "./audit";
import type { LaunchFailure } from "./launch-run";
import { inWorkspace, type Scope } from "./scope";

export interface ActivationResult {
  status: LaunchStatus;
  startAt: number | null;
  failure: LaunchFailure | null;
}

const ACTIVATING = "activating";

const launchById = (scope: Scope, id: string) =>
  and(inWorkspace(launches, scope), eq(launches.id, id));

export async function findLaunchForActivate(
  db: D1Database,
  scope: Scope,
  id: string,
) {
  const [row] = await drizzle(db)
    .select({
      status: sql<LaunchStatus>`${launches.status}`,
      checksOk: launches.checksOk,
    })
    .from(launches)
    .where(launchById(scope, id))
    .limit(1);
  return row ?? null;
}

export async function claimActivation(
  db: D1Database,
  scope: Scope,
  id: string,
  { fromStatus, at }: { fromStatus: LaunchStatus; at: number },
) {
  const rows = await drizzle(db)
    .update(launches)
    .set({
      status: ACTIVATING,
      phase: "activate",
      errorCode: null,
      errorMessage: null,
      updatedAt: at,
    })
    .where(
      and(
        launchById(scope, id),
        eq(launches.status, fromStatus),
        eq(launches.checksOk, 1),
      ),
    )
    .returning({ id: launches.id });
  return rows.length === 1;
}

export async function findActivationTargets(
  db: D1Database,
  scope: Scope,
  id: string,
) {
  const orm = drizzle(db);
  const [[launch], ads] = await orm.batch([
    orm
      .select({
        draft: launches.draft,
        adAccountMetaId: launches.adAccountMetaId,
        metaCampaignId: launches.metaCampaignId,
        metaAdsetId: launches.metaAdsetId,
      })
      .from(launches)
      .where(and(launchById(scope, id), eq(launches.status, ACTIVATING)))
      .limit(1),
    orm
      .select({ metaAdId: sql<string>`${launchItems.metaAdId}` })
      .from(launchItems)
      .where(
        and(
          inWorkspace(launchItems, scope),
          eq(launchItems.launchId, id),
          eq(launchItems.status, "done"),
          isNotNull(launchItems.metaAdId),
        ),
      )
      .orderBy(launchItems.position),
  ]);
  return launch ? { ...launch, adIds: ads.map((ad) => ad.metaAdId) } : null;
}

export async function finishActivation(
  db: D1Database,
  scope: Scope,
  id: string,
  { status, startAt, failure }: ActivationResult,
  audit: AuditEntry,
) {
  const orm = drizzle(db);
  const at = now();
  const activated = failure
    ? {}
    : { startAt, activatedBy: scope.userId, activatedAt: at };
  await orm.batch([
    orm
      .update(launches)
      .set({
        status,
        ...activated,
        errorCode: failure?.errorCode ?? null,
        errorMessage: failure?.errorMessage ?? null,
        updatedAt: at,
      })
      .where(and(launchById(scope, id), eq(launches.status, ACTIVATING))),
    auditStatement(db, audit),
  ]);
}
