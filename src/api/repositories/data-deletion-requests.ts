import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { metaConnections } from "../../db/schema/meta";
import { dataDeletionRequests } from "../../db/schema/ops";

export type DataDeletionStatus = "received" | "done";

export type DataDeletionRequestWrite = Pick<
  typeof dataDeletionRequests.$inferInsert,
  "id" | "confirmationCode" | "metaUserId" | "createdAt"
>;

export async function insertDataDeletionRequest(
  db: D1Database,
  request: DataDeletionRequestWrite,
): Promise<void> {
  await drizzle(db).insert(dataDeletionRequests).values(request);
}

export async function findDataDeletionStatus(
  db: D1Database,
  confirmationCode: string,
) {
  const [row] = await drizzle(db)
    .select({
      status: sql<DataDeletionStatus>`${dataDeletionRequests.status}`,
      createdAt: dataDeletionRequests.createdAt,
      completedAt: dataDeletionRequests.completedAt,
    })
    .from(dataDeletionRequests)
    .where(eq(dataDeletionRequests.confirmationCode, confirmationCode))
    .limit(1);
  return row ?? null;
}

export async function findDataDeletionRequest(db: D1Database, id: string) {
  const [row] = await drizzle(db)
    .select({
      metaUserId: dataDeletionRequests.metaUserId,
      status: sql<DataDeletionStatus>`${dataDeletionRequests.status}`,
    })
    .from(dataDeletionRequests)
    .where(eq(dataDeletionRequests.id, id))
    .limit(1);
  return row ?? null;
}

const connectionsOfMetaUser = (metaUserId: string) =>
  sql<number>`(select count(*) from ${metaConnections} where ${metaConnections.metaUserId} = ${metaUserId})`;

export async function completeDataDeletion(
  db: D1Database,
  id: string,
  metaUserId: string,
  at: number,
): Promise<void> {
  const orm = drizzle(db);
  await orm.batch([
    orm
      .update(dataDeletionRequests)
      .set({
        status: "done",
        connectionsAffected: connectionsOfMetaUser(metaUserId),
        completedAt: at,
      })
      .where(
        and(
          eq(dataDeletionRequests.id, id),
          eq(dataDeletionRequests.status, "received"),
        ),
      ),
    orm
      .delete(metaConnections)
      .where(eq(metaConnections.metaUserId, metaUserId)),
  ]);
}
