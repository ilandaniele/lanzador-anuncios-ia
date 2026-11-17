import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { memberships, workspaces } from "../../db/schema/workspaces";
import type { Role, WorkspaceStatus } from "../../shared/constants";

export async function findWorkspaceAccess(
  db: D1Database,
  workspaceId: string,
  userId: string,
): Promise<{ status: WorkspaceStatus; role: Role | null } | null> {
  const [row] = await drizzle(db)
    .select({
      status: sql<WorkspaceStatus>`${workspaces.status}`,
      role: sql<Role | null>`${memberships.role}`,
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
