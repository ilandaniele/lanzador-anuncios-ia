import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { users } from "../../db/schema/auth";
import { memberships, workspaces } from "../../db/schema/workspaces";
import type { Role, WorkspaceStatus } from "../../shared/constants";

const userColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  isSuperadmin: users.isSuperadmin,
  status: users.status,
};

export async function findUserByEmail(db: D1Database, email: string) {
  const [row] = await drizzle(db)
    .select(userColumns)
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row ?? null;
}

export async function upsertLoginUser(
  db: D1Database,
  row: { id: string; email: string; isSuperadmin: boolean; at: number },
) {
  const [user] = await drizzle(db)
    .insert(users)
    .values({
      id: row.id,
      email: row.email,
      isSuperadmin: row.isSuperadmin ? 1 : 0,
      createdAt: row.at,
      lastLoginAt: row.at,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        lastLoginAt: row.at,
        isSuperadmin: sql`excluded.is_superadmin`,
      },
    })
    .returning(userColumns);
  return user!;
}

export async function listUserWorkspaces(db: D1Database, userId: string) {
  return drizzle(db)
    .select({
      id: workspaces.id,
      name: workspaces.name,
      role: sql<Role>`${memberships.role}`,
      status: sql<WorkspaceStatus>`${workspaces.status}`,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, userId));
}
