import { and, asc, eq, getTableName, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { creatives } from "../../db/schema/creatives";
import { metaAssets, metaConnections } from "../../db/schema/meta";
import type { ConnectionStatus } from "../../shared/constants";
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

const outerConnection = (column: "id" | "workspace_id") =>
  sql.raw(`"${getTableName(metaConnections)}"."${column}"`);

const creativeCount = sql<number>`(select count(*) from ${creatives} where ${creatives.workspaceId} = ${outerConnection("workspace_id")} and ${creatives.adAccountAssetId} in (select ${metaAssets.id} from ${metaAssets} where ${metaAssets.connectionId} = ${outerConnection("id")}))`;

export const selectConnections = (db: D1Database, scope: Scope) =>
  drizzle(db)
    .select({
      id: metaConnections.id,
      metaBusinessId: metaConnections.metaBusinessId,
      businessName: metaConnections.businessName,
      status: sql<ConnectionStatus>`${metaConnections.status}`,
      scopes: metaConnections.scopes,
      connectedBy: metaConnections.connectedBy,
      createdAt: metaConnections.createdAt,
      lastErrorCode: metaConnections.lastErrorCode,
      tokenExpiresAt: metaConnections.tokenExpiresAt,
      creativeCount,
    })
    .from(metaConnections)
    .where(inWorkspace(metaConnections, scope))
    .orderBy(asc(metaConnections.createdAt), asc(metaConnections.id));

export type ConnectionRow = Awaited<
  ReturnType<typeof selectConnections>
>[number];

export async function findConnectionSecret(
  db: D1Database,
  scope: Scope,
  connectionId: string,
) {
  const [row] = await drizzle(db)
    .select({
      id: metaConnections.id,
      metaBusinessId: metaConnections.metaBusinessId,
      businessName: metaConnections.businessName,
      status: sql<ConnectionStatus>`${metaConnections.status}`,
      tokenCiphertext: metaConnections.tokenCiphertext,
      tokenIv: metaConnections.tokenIv,
      tokenKeyVersion: metaConnections.tokenKeyVersion,
    })
    .from(metaConnections)
    .where(
      and(
        inWorkspace(metaConnections, scope),
        eq(metaConnections.id, connectionId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type ConnectionSecret = NonNullable<
  Awaited<ReturnType<typeof findConnectionSecret>>
>;

export async function deleteConnection(
  db: D1Database,
  scope: Scope,
  connectionId: string,
  audit: AuditEntry,
): Promise<void> {
  const orm = drizzle(db);
  await orm.batch([
    orm
      .delete(metaConnections)
      .where(
        and(
          inWorkspace(metaConnections, scope),
          eq(metaConnections.id, connectionId),
        ),
      ),
    auditStatement(db, audit),
  ]);
}
