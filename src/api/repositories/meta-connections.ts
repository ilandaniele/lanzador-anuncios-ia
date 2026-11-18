import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { metaConnections } from "../../db/schema/meta";
import type { DiscoveredAsset } from "../integrations/meta/read";
import { type AuditEntry, auditStatement } from "./audit";
import { assetSyncStatements } from "./meta-assets";
import { inWorkspace, type Scope } from "./scope";

export type MetaConnectionWrite = Pick<
  typeof metaConnections.$inferInsert,
  | "id"
  | "metaBusinessId"
  | "businessName"
  | "metaUserId"
  | "tokenType"
  | "tokenCiphertext"
  | "tokenIv"
  | "tokenKeyVersion"
  | "tokenExpiresAt"
  | "scopes"
>;

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

export async function findConnectionIdByBusiness(
  db: D1Database,
  scope: Scope,
  metaBusinessId: string,
): Promise<string | null> {
  const [row] = await drizzle(db)
    .select({ id: metaConnections.id })
    .from(metaConnections)
    .where(
      and(
        inWorkspace(metaConnections, scope),
        eq(metaConnections.metaBusinessId, metaBusinessId),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

export async function upsertConnection(
  db: D1Database,
  scope: Scope,
  connection: MetaConnectionWrite,
  at: number,
): Promise<boolean> {
  const { id, metaBusinessId, ...fields } = connection;
  const active = {
    ...fields,
    status: "active",
    lastErrorCode: null,
    lastErrorAt: null,
    connectedBy: scope.userId,
    updatedAt: at,
  };
  const applied = await drizzle(db)
    .insert(metaConnections)
    .values({
      ...active,
      id,
      workspaceId: scope.workspaceId,
      metaBusinessId,
      createdAt: at,
    })
    .onConflictDoUpdate({
      target: [metaConnections.workspaceId, metaConnections.metaBusinessId],
      set: active,
      setWhere: eq(metaConnections.id, id),
    })
    .returning({ id: metaConnections.id });
  return applied.length > 0;
}

export async function saveConnectedAssets(
  db: D1Database,
  scope: Scope,
  connectionId: string,
  assets: DiscoveredAsset[],
  audit: AuditEntry,
  at: number,
): Promise<void> {
  const orm = drizzle(db);
  await orm.batch([
    ...assetSyncStatements(orm, scope, connectionId, assets, at),
    auditStatement(db, audit),
  ]);
}
