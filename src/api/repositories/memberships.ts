import { and, eq, exists, gt, ne, sql } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { users } from "../../db/schema/auth";
import { memberships, workspaces } from "../../db/schema/workspaces";
import type {
  InvitableRole,
  Role,
  WorkspaceStatus,
} from "../../shared/constants";
import { newId } from "../lib/ids";
import { type AuditEntry, auditStatement } from "./audit";
import { inWorkspace, type Scope } from "./scope";

const memberColumns = {
  id: memberships.id,
  userId: memberships.userId,
  email: users.email,
  name: users.name,
  role: sql<Role>`${memberships.role}`,
  joinedAt: memberships.createdAt,
};

export type MemberRow = {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  joinedAt: number;
};

const selectMemberRows = (orm: DrizzleD1Database) =>
  orm
    .select(memberColumns)
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId));

export async function findWorkspaceAccess(
  db: D1Database,
  workspaceId: string,
  userId: string,
): Promise<{
  status: WorkspaceStatus;
  role: Role | null;
  lastActivityAt: number | null;
} | null> {
  const [row] = await drizzle(db)
    .select({
      status: sql<WorkspaceStatus>`${workspaces.status}`,
      role: sql<Role | null>`${memberships.role}`,
      lastActivityAt: workspaces.lastActivityAt,
    })
    .from(workspaces)
    .leftJoin(
      memberships,
      and(
        eq(memberships.workspaceId, workspaces.id),
        eq(memberships.userId, userId),
      ),
    )
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return row ?? null;
}

export const insertOwnerMembership = (
  db: D1Database,
  row: { workspaceId: string; userId: string; at: number },
) =>
  drizzle(db).insert(memberships).values({
    id: newId(),
    workspaceId: row.workspaceId,
    userId: row.userId,
    role: "owner",
    createdAt: row.at,
    updatedAt: row.at,
  });

export const selectMembers = (
  db: D1Database,
  scope: Scope,
  page: { after?: string; size: number },
): Promise<MemberRow[]> =>
  selectMemberRows(drizzle(db))
    .where(
      and(
        inWorkspace(memberships, scope),
        page.after ? gt(memberships.id, page.after) : undefined,
      ),
    )
    .orderBy(memberships.id)
    .limit(page.size + 1);

export async function findMember(
  db: D1Database,
  scope: Scope,
  userId: string,
): Promise<MemberRow | null> {
  const [row] = await selectMemberRows(drizzle(db))
    .where(and(inWorkspace(memberships, scope), eq(memberships.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function setMemberRole(
  db: D1Database,
  scope: Scope,
  change: { userId: string; role: InvitableRole; at: number },
  audit: AuditEntry,
) {
  const orm = drizzle(db);
  await orm.batch([
    orm
      .update(memberships)
      .set({ role: change.role, updatedAt: change.at })
      .where(
        and(
          inWorkspace(memberships, scope),
          eq(memberships.userId, change.userId),
          ne(memberships.role, "owner"),
        ),
      ),
    auditStatement(db, audit),
  ]);
}

export async function deleteMember(
  db: D1Database,
  scope: Scope,
  userId: string,
  audit: AuditEntry,
) {
  const orm = drizzle(db);
  await orm.batch([
    orm
      .delete(memberships)
      .where(
        and(
          inWorkspace(memberships, scope),
          eq(memberships.userId, userId),
          ne(memberships.role, "owner"),
        ),
      ),
    auditStatement(db, audit),
  ]);
}

export const memberExists = (
  orm: DrizzleD1Database,
  scope: Scope,
  userId: string,
  role?: Role,
) =>
  exists(
    orm
      .select({ one: sql`1` })
      .from(memberships)
      .where(
        and(
          inWorkspace(memberships, scope),
          eq(memberships.userId, userId),
          role ? eq(memberships.role, role) : undefined,
        ),
      ),
  );

export const demoteOwnerStatement = (
  orm: DrizzleD1Database,
  scope: Scope,
  successorId: string,
  at: number,
) =>
  orm
    .update(memberships)
    .set({ role: "admin", updatedAt: at })
    .where(
      and(
        inWorkspace(memberships, scope),
        eq(memberships.userId, scope.userId),
        eq(memberships.role, "owner"),
        memberExists(orm, scope, successorId),
      ),
    );

export const promoteToOwnerStatement = (
  orm: DrizzleD1Database,
  scope: Scope,
  userId: string,
  at: number,
) =>
  orm
    .update(memberships)
    .set({ role: "owner", updatedAt: at })
    .where(
      and(
        inWorkspace(memberships, scope),
        eq(memberships.userId, userId),
        ne(memberships.role, "owner"),
      ),
    );
