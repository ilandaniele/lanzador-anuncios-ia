import { and, eq, sql } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { googleConnections } from "../../db/schema/meta";
import type { ConnectionStatus } from "../../shared/constants";
import { type AuditEntry, auditStatement } from "./audit";
import { inWorkspace, type Scope } from "./scope";

export type GoogleConnectionWrite = Pick<
  typeof googleConnections.$inferInsert,
  | "id"
  | "googleEmail"
  | "refreshTokenCiphertext"
  | "refreshTokenIv"
  | "tokenKeyVersion"
  | "scopes"
>;

const ofCurrentUser = (scope: Scope) =>
  and(
    inWorkspace(googleConnections, scope),
    eq(googleConnections.userId, scope.userId),
  );

const status = sql<ConnectionStatus>`${googleConnections.status}`;

export async function replaceGoogleConnection(
  db: D1Database,
  scope: Scope,
  connection: GoogleConnectionWrite,
  audit: AuditEntry,
  at: number,
): Promise<void> {
  const orm = drizzle(db);
  await orm.batch([
    orm.delete(googleConnections).where(ofCurrentUser(scope)),
    orm.insert(googleConnections).values({
      ...connection,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      status: "active",
      createdAt: at,
      updatedAt: at,
    }),
    auditStatement(db, audit),
  ]);
}

export async function findGoogleConnection(db: D1Database, scope: Scope) {
  const [row] = await drizzle(db)
    .select({ email: googleConnections.googleEmail, status })
    .from(googleConnections)
    .where(ofCurrentUser(scope))
    .limit(1);
  return row ?? null;
}

export async function findGoogleConnectionSecret(db: D1Database, scope: Scope) {
  const [row] = await drizzle(db)
    .select({
      id: googleConnections.id,
      status,
      refreshTokenCiphertext: googleConnections.refreshTokenCiphertext,
      refreshTokenIv: googleConnections.refreshTokenIv,
      tokenKeyVersion: googleConnections.tokenKeyVersion,
    })
    .from(googleConnections)
    .where(ofCurrentUser(scope))
    .limit(1);
  return row ?? null;
}

export type GoogleConnectionSecret = NonNullable<
  Awaited<ReturnType<typeof findGoogleConnectionSecret>>
>;

export async function setGoogleReconnectRequired(
  db: D1Database,
  scope: Scope,
  connectionId: string,
  at: number,
): Promise<void> {
  await drizzle(db)
    .update(googleConnections)
    .set({ status: "reconnect_required", updatedAt: at })
    .where(and(ofCurrentUser(scope), eq(googleConnections.id, connectionId)));
}

export async function deleteGoogleConnection(
  db: D1Database,
  scope: Scope,
  connectionId: string,
  audit: AuditEntry,
): Promise<void> {
  const orm = drizzle(db);
  await orm.batch([
    orm
      .delete(googleConnections)
      .where(and(ofCurrentUser(scope), eq(googleConnections.id, connectionId))),
    auditStatement(db, audit),
  ]);
}

export const deleteMemberGoogleConnection = (
  orm: DrizzleD1Database,
  scope: Scope,
  userId: string,
) =>
  orm
    .delete(googleConnections)
    .where(
      and(
        inWorkspace(googleConnections, scope),
        eq(googleConnections.userId, userId),
      ),
    );
