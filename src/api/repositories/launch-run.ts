import { and, eq, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { creatives } from "../../db/schema/creatives";
import { launchItems, launches } from "../../db/schema/launches";
import type { CreativeKind } from "../../shared/schemas/creatives";
import type { LaunchPhase, LaunchStatus } from "../../shared/schemas/launch";
import { newId } from "../lib/ids";
import { now } from "../lib/time";
import { type AuditEntry, auditStatement } from "./audit";
import { inWorkspace, type Scope } from "./scope";

const FINISHED_ITEM_STATUSES = ["done", "failed"];

export interface QueuedLaunch {
  planHash: string;
  draftUpdatedAt: number;
  attempt: number;
  workflowInstanceId: string;
  items: NewLaunchItem[];
}

export interface NewLaunchItem {
  source: string;
  creativeId?: string;
  cloneSourceAdId?: string;
  cloneStoryId?: string;
  copyId?: string;
  adName: string;
}

export interface LaunchFailure {
  errorCode: string;
  errorMessage: string;
}

const launchById = (scope: Scope, id: string) =>
  and(inWorkspace(launches, scope), eq(launches.id, id));

const itemById = (scope: Scope, id: string) =>
  and(inWorkspace(launchItems, scope), eq(launchItems.id, id));

const countItems = (launchId: string, status: string) =>
  sql<number>`(SELECT count(*) FROM ${launchItems} WHERE ${launchItems.launchId} = ${launchId} AND ${launchItems.status} = ${status})`;

const recountStatement = (db: D1Database, scope: Scope, launchId: string) =>
  drizzle(db)
    .update(launches)
    .set({
      itemsDone: countItems(launchId, "done"),
      itemsFailed: countItems(launchId, "failed"),
      updatedAt: now(),
    })
    .where(launchById(scope, launchId));

export async function findLaunchForStart(
  db: D1Database,
  scope: Scope,
  id: string,
) {
  const [row] = await drizzle(db)
    .select({
      status: sql<LaunchStatus>`${launches.status}`,
      draft: launches.draft,
      planHash: launches.planHash,
      updatedAt: launches.updatedAt,
      attempt: launches.attempt,
    })
    .from(launches)
    .where(launchById(scope, id))
    .limit(1);
  return row ?? null;
}

export async function queueLaunch(
  db: D1Database,
  scope: Scope,
  id: string,
  queued: QueuedLaunch,
) {
  const at = now();
  const rows = await drizzle(db)
    .update(launches)
    .set({
      status: "queued",
      phase: "preflight",
      attempt: queued.attempt,
      workflowInstanceId: queued.workflowInstanceId,
      itemsTotal: queued.items.length,
      itemsDone: 0,
      itemsFailed: 0,
      errorCode: null,
      errorMessage: null,
      startedBy: scope.userId,
      startedAt: at,
      updatedAt: at,
    })
    .where(
      and(
        launchById(scope, id),
        eq(launches.status, "simulated"),
        eq(launches.planHash, queued.planHash),
        eq(launches.updatedAt, queued.draftUpdatedAt),
      ),
    )
    .returning({ id: launches.id });
  if (rows.length !== 1) return false;
  await drizzle(db)
    .insert(launchItems)
    .values(
      queued.items.map((item, position) => ({
        ...item,
        id: newId(),
        workspaceId: scope.workspaceId,
        launchId: id,
        position,
        createdAt: at,
        updatedAt: at,
      })),
    )
    .onConflictDoNothing();
  return true;
}

export async function findLaunchRun(db: D1Database, scope: Scope, id: string) {
  const [row] = await drizzle(db)
    .select({
      draft: launches.draft,
      plan: launches.plan,
      startedAt: launches.startedAt,
      metaCampaignId: launches.metaCampaignId,
      metaAdsetId: launches.metaAdsetId,
    })
    .from(launches)
    .where(launchById(scope, id))
    .limit(1);
  return row ?? null;
}

export async function setLaunchPhase(
  db: D1Database,
  scope: Scope,
  id: string,
  status: LaunchStatus,
  phase: LaunchPhase,
) {
  await drizzle(db)
    .update(launches)
    .set({ status, phase, updatedAt: now() })
    .where(launchById(scope, id));
}

export async function saveLaunchObject(
  db: D1Database,
  scope: Scope,
  id: string,
  object: { metaCampaignId: string } | { metaAdsetId: string },
  audit: AuditEntry,
) {
  const orm = drizzle(db);
  await orm.batch([
    orm
      .update(launches)
      .set({ ...object, updatedAt: now() })
      .where(launchById(scope, id)),
    auditStatement(db, audit),
  ]);
}

export const selectPendingItems = (
  db: D1Database,
  scope: Scope,
  launchId: string,
  limit: number,
) =>
  drizzle(db)
    .select({
      id: launchItems.id,
      adName: launchItems.adName,
      cloneStoryId: launchItems.cloneStoryId,
      metaCreativeId: launchItems.metaCreativeId,
      kind: sql<CreativeKind | null>`${creatives.kind}`,
      metaImageHash: creatives.metaImageHash,
      metaVideoId: creatives.metaVideoId,
      thumbnailUrl: creatives.thumbnailUrl,
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
        notInArray(launchItems.status, FINISHED_ITEM_STATUSES),
      ),
    )
    .orderBy(launchItems.position)
    .limit(limit);

export type PendingItem = Awaited<
  ReturnType<typeof selectPendingItems>
>[number];

export async function saveItemCreative(
  db: D1Database,
  scope: Scope,
  itemId: string,
  metaCreativeId: string,
  audit: AuditEntry,
) {
  const orm = drizzle(db);
  await orm.batch([
    orm
      .update(launchItems)
      .set({ metaCreativeId, status: "creating_ad", updatedAt: now() })
      .where(itemById(scope, itemId)),
    auditStatement(db, audit),
  ]);
}

export async function completeItem(
  db: D1Database,
  scope: Scope,
  launchId: string,
  itemId: string,
  metaAdId: string,
  audit: AuditEntry,
) {
  const orm = drizzle(db);
  await orm.batch([
    orm
      .update(launchItems)
      .set({ metaAdId, status: "done", updatedAt: now() })
      .where(itemById(scope, itemId)),
    recountStatement(db, scope, launchId),
    auditStatement(db, audit),
  ]);
}

export async function failItem(
  db: D1Database,
  scope: Scope,
  launchId: string,
  itemId: string,
  failure: LaunchFailure,
) {
  const orm = drizzle(db);
  await orm.batch([
    orm
      .update(launchItems)
      .set({ ...failure, status: "failed", updatedAt: now() })
      .where(itemById(scope, itemId)),
    recountStatement(db, scope, launchId),
  ]);
}

export async function readLaunchCounters(
  db: D1Database,
  scope: Scope,
  id: string,
) {
  const [row] = await drizzle(db)
    .select({
      itemsTotal: launches.itemsTotal,
      itemsDone: launches.itemsDone,
      itemsFailed: launches.itemsFailed,
    })
    .from(launches)
    .where(launchById(scope, id))
    .limit(1);
  return row ?? { itemsTotal: 0, itemsDone: 0, itemsFailed: 0 };
}

export async function failLaunch(
  db: D1Database,
  scope: Scope,
  id: string,
  failure: LaunchFailure,
) {
  const at = now();
  await drizzle(db)
    .update(launches)
    .set({ ...failure, status: "failed", finishedAt: at, updatedAt: at })
    .where(launchById(scope, id));
}
