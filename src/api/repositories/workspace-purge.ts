import { and, eq, exists, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { usageCounters } from "../../db/schema/ops";
import { workspaces } from "../../db/schema/workspaces";

const purgeable = (deletedBefore: number) =>
  and(
    eq(workspaces.status, "deleting"),
    lte(workspaces.deletedAt, deletedBefore),
  );

export async function selectPurgeableWorkspaceIds(
  db: D1Database,
  deletedBefore: number,
  limit: number,
): Promise<string[]> {
  const rows = await drizzle(db)
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(purgeable(deletedBefore))
    .orderBy(workspaces.deletedAt)
    .limit(limit);
  return rows.map(({ id }) => id);
}

export async function deletePurgeableWorkspace(
  db: D1Database,
  workspaceId: string,
  deletedBefore: number,
): Promise<void> {
  const orm = drizzle(db);
  const target = and(eq(workspaces.id, workspaceId), purgeable(deletedBefore));
  await orm.batch([
    orm
      .delete(usageCounters)
      .where(
        and(
          eq(usageCounters.scope, "workspace"),
          eq(usageCounters.scopeId, workspaceId),
          exists(
            orm.select({ id: workspaces.id }).from(workspaces).where(target),
          ),
        ),
      ),
    orm.delete(workspaces).where(target),
  ]);
}
