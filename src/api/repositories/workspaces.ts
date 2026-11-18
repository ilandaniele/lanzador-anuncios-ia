import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { betaInvites, plans } from "../../db/schema/auth";
import { workspaces } from "../../db/schema/workspaces";
import type { WorkspaceStatus } from "../../shared/constants";
import type { UtcPeriods } from "../lib/time";
import { type AuditEntry, auditStatement } from "./audit";
import {
  demoteOwnerStatement,
  insertOwnerMembership,
  memberExists,
  promoteToOwnerStatement,
} from "./memberships";
import { insertDefaultPilotRules } from "./pilot-rules";
import type { Scope } from "./scope";
import { insertDefaultSettings, selectSettings, toSettings } from "./settings";
import { aiNeuronsQuery, foldAiNeurons } from "./usage-counters";

const workspaceColumns = {
  id: workspaces.id,
  name: workspaces.name,
  planId: workspaces.planId,
  status: sql<WorkspaceStatus>`${workspaces.status}`,
  createdAt: workspaces.createdAt,
};

export type CreationEligibility = { invited: boolean; ownedCount: number };

export async function findCreationEligibility(
  db: D1Database,
  userId: string,
  email: string,
): Promise<CreationEligibility> {
  const row = await drizzle(db).get<{ invited: number; ownedCount: number }>(
    sql`SELECT
      EXISTS (SELECT 1 FROM ${betaInvites}
        WHERE ${betaInvites.email} = ${email} AND ${betaInvites.revokedAt} IS NULL) AS invited,
      (SELECT count(*) FROM ${workspaces}
        WHERE ${workspaces.ownerUserId} = ${userId} AND ${workspaces.status} != 'deleting') AS ownedCount`,
  );
  return { invited: row?.invited === 1, ownedCount: row?.ownedCount ?? 0 };
}

export async function insertWorkspaceWithDefaults(
  db: D1Database,
  row: { id: string; name: string; ownerUserId: string; at: number },
  ownerEmail: string,
) {
  const { id, name, ownerUserId, at } = row;
  const orm = drizzle(db);
  const [[workspace]] = await orm.batch([
    orm
      .insert(workspaces)
      .values({ id, name, ownerUserId, createdAt: at, updatedAt: at })
      .returning(workspaceColumns),
    insertOwnerMembership(db, { workspaceId: id, userId: ownerUserId, at }),
    insertDefaultSettings(db, id, at),
    insertDefaultPilotRules(db, id, at),
    orm
      .update(betaInvites)
      .set({ usedAt: at })
      .where(
        and(eq(betaInvites.email, ownerEmail), isNull(betaInvites.usedAt)),
      ),
  ]);
  return workspace!;
}

export async function findOverview(
  db: D1Database,
  scope: Scope,
  periods: UtcPeriods,
) {
  const orm = drizzle(db);
  const [[workspace], [settings], neuronRows] = await orm.batch([
    orm
      .select({
        ...workspaceColumns,
        aiDailyNeuronsOverride: workspaces.aiDailyNeuronsOverride,
        aiMonthlyNeuronsOverride: workspaces.aiMonthlyNeuronsOverride,
        plan: {
          name: sql<string>`${plans.name}`.as("plan_name"),
          maxMembers: plans.maxMembers,
          maxAdAccounts: plans.maxAdAccounts,
          maxCreativesPerLaunch: plans.maxCreativesPerLaunch,
          aiDailyNeurons: plans.aiDailyNeurons,
          aiMonthlyNeurons: plans.aiMonthlyNeurons,
        },
      })
      .from(workspaces)
      .innerJoin(plans, eq(plans.id, workspaces.planId))
      .where(eq(workspaces.id, scope.workspaceId))
      .limit(1),
    selectSettings(orm, scope),
    aiNeuronsQuery(orm, scope.workspaceId, periods),
  ]);
  if (!workspace || !settings) return null;
  return {
    workspace,
    settings: toSettings(settings),
    neurons: foldAiNeurons(neuronRows, periods),
  };
}

export async function findWorkspaceName(db: D1Database, scope: Scope) {
  const [row] = await drizzle(db)
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, scope.workspaceId))
    .limit(1);
  return row?.name ?? null;
}

export async function renameWorkspace(
  db: D1Database,
  scope: Scope,
  name: string,
  at: number,
) {
  const [row] = await drizzle(db)
    .update(workspaces)
    .set({ name, updatedAt: at })
    .where(eq(workspaces.id, scope.workspaceId))
    .returning(workspaceColumns);
  return row ?? null;
}

export async function markWorkspaceDeleting(
  db: D1Database,
  scope: Scope,
  audit: AuditEntry,
  at: number,
) {
  const orm = drizzle(db);
  await orm.batch([
    orm
      .update(workspaces)
      .set({ status: "deleting", deletedAt: at, updatedAt: at })
      .where(eq(workspaces.id, scope.workspaceId)),
    auditStatement(db, audit),
  ]);
}

export async function transferOwnership(
  db: D1Database,
  scope: Scope,
  transfer: { successorId: string; at: number },
  audits: AuditEntry[],
) {
  const { successorId, at } = transfer;
  const orm = drizzle(db);
  const [, , [workspace]] = await orm.batch([
    demoteOwnerStatement(orm, scope, successorId, at),
    promoteToOwnerStatement(orm, scope, successorId, at),
    orm
      .update(workspaces)
      .set({ ownerUserId: successorId, updatedAt: at })
      .where(
        and(
          eq(workspaces.id, scope.workspaceId),
          memberExists(orm, scope, successorId, "owner"),
        ),
      )
      .returning(workspaceColumns),
    ...audits.map((audit) => auditStatement(db, audit)),
  ]);
  return workspace ?? null;
}

export async function findMaxCreativesPerLaunch(db: D1Database, scope: Scope) {
  const [row] = await drizzle(db)
    .select({ max: plans.maxCreativesPerLaunch })
    .from(workspaces)
    .innerJoin(plans, eq(plans.id, workspaces.planId))
    .where(eq(workspaces.id, scope.workspaceId))
    .limit(1);
  return row?.max ?? null;
}

export async function touchWorkspaceActivity(
  db: D1Database,
  workspaceId: string,
  at: number,
  staleBefore: number,
): Promise<void> {
  await drizzle(db)
    .update(workspaces)
    .set({ lastActivityAt: at })
    .where(
      and(
        eq(workspaces.id, workspaceId),
        or(
          isNull(workspaces.lastActivityAt),
          lt(workspaces.lastActivityAt, staleBefore),
        ),
      ),
    );
}
