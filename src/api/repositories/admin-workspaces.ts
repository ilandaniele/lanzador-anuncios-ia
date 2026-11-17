import { and, eq, gt, sql } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { users } from "../../db/schema/auth";
import { metaConnections } from "../../db/schema/meta";
import { usageCounters } from "../../db/schema/ops";
import { memberships, workspaces } from "../../db/schema/workspaces";
import type { ConnectionStatus, WorkspaceStatus } from "../../shared/constants";
import { type AuditEntry, auditStatement } from "./audit";
import { isForeignKeyViolation } from "./db-errors";

export type WorkspaceState = {
  status: WorkspaceStatus;
  deletedAt: number | null;
};

export type WorkspaceChanges = Partial<
  Pick<
    typeof workspaces.$inferInsert,
    | "status"
    | "disabledReason"
    | "planId"
    | "aiDailyNeuronsOverride"
    | "aiMonthlyNeuronsOverride"
    | "deletedAt"
  >
>;

const selectAdminWorkspaces = (orm: DrizzleD1Database, month: string) =>
  orm
    .select({
      id: workspaces.id,
      name: workspaces.name,
      status: sql<WorkspaceStatus>`${workspaces.status}`,
      planId: workspaces.planId,
      ownerEmail: users.email,
      metaStatus: sql<ConnectionStatus | null>`(SELECT CASE
        WHEN count(*) = 0 THEN NULL
        WHEN max(${metaConnections.status} = 'active') = 1 THEN 'active'
        ELSE 'reconnect_required' END
        FROM ${metaConnections} WHERE ${metaConnections.workspaceId} = ${workspaces.id})`,
      memberCount: sql<number>`(SELECT count(*) FROM ${memberships}
        WHERE ${memberships.workspaceId} = ${workspaces.id})`,
      lastActivityAt: workspaces.lastActivityAt,
      createdAt: workspaces.createdAt,
      aiNeuronsMonth: sql<number>`coalesce((SELECT ${usageCounters.value}
        FROM ${usageCounters}
        WHERE ${usageCounters.scope} = 'workspace'
          AND ${usageCounters.scopeId} = ${workspaces.id}
          AND ${usageCounters.period} = ${month}
          AND ${usageCounters.metric} = 'ai_neurons'), 0)`,
    })
    .from(workspaces)
    .innerJoin(users, eq(users.id, workspaces.ownerUserId));

export type AdminWorkspaceRow = Awaited<
  ReturnType<typeof selectAdminWorkspaces>
>[number];

export const selectWorkspacesPage = (
  db: D1Database,
  month: string,
  page: { status?: WorkspaceStatus; after?: string; size: number },
): Promise<AdminWorkspaceRow[]> =>
  selectAdminWorkspaces(drizzle(db), month)
    .where(
      and(
        page.status ? eq(workspaces.status, page.status) : undefined,
        page.after ? gt(workspaces.id, page.after) : undefined,
      ),
    )
    .orderBy(workspaces.id)
    .limit(page.size + 1);

export async function findWorkspaceState(
  db: D1Database,
  id: string,
): Promise<WorkspaceState | null> {
  const [row] = await drizzle(db)
    .select({
      status: sql<WorkspaceStatus>`${workspaces.status}`,
      deletedAt: workspaces.deletedAt,
    })
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);
  return row ?? null;
}

export async function updateAdminWorkspace(
  db: D1Database,
  id: string,
  update: { changes: WorkspaceChanges; month: string; at: number },
  audits: AuditEntry[],
): Promise<AdminWorkspaceRow | null> {
  const { changes, month, at } = update;
  const orm = drizzle(db);
  try {
    const [, [row]] = await orm.batch([
      orm
        .update(workspaces)
        .set({ ...changes, updatedAt: at })
        .where(eq(workspaces.id, id)),
      selectAdminWorkspaces(orm, month).where(eq(workspaces.id, id)).limit(1),
      ...audits.map((audit) => auditStatement(db, audit)),
    ]);
    return row ?? null;
  } catch (error) {
    if (isForeignKeyViolation(error)) return null;
    throw error;
  }
}
