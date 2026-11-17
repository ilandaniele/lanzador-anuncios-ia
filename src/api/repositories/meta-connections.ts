import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { metaConnections } from "../../db/schema/meta";

export async function setConnectionReconnectRequired(
  db: D1Database,
  workspaceId: string,
  connectionId: string,
  code: number,
  at: number,
): Promise<void> {
  await drizzle(db)
    .update(metaConnections)
    .set({
      status: "reconnect_required",
      lastErrorCode: code,
      lastErrorAt: at,
      updatedAt: at,
    })
    .where(
      and(
        eq(metaConnections.id, connectionId),
        eq(metaConnections.workspaceId, workspaceId),
        eq(metaConnections.status, "active"),
      ),
    );
}
