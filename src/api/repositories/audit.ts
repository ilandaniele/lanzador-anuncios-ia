import { and, desc, eq, gte, lt, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { users } from "../../db/schema/auth";
import { auditLog } from "../../db/schema/ops";
import type {
  AuditActorType,
  AuditOrigin,
  AuditResult,
} from "../../shared/constants";
import { newId } from "../lib/ids";
import { now } from "../lib/time";
import { inWorkspace, type Scope } from "./scope";

export type AuditEntry = {
  workspaceId: string | null;
  actorUserId: string | null;
  actorType: AuditActorType;
  origin: AuditOrigin;
  action: string;
  objectType?: string;
  objectMetaId?: string;
  objectName?: string;
  adAccountMetaId?: string;
  launchId?: string;
  result?: AuditResult;
  detail?: Record<string, unknown>;
  requestId?: string;
};

export const auditStatement = (db: D1Database, entry: AuditEntry) =>
  drizzle(db)
    .insert(auditLog)
    .values({
      ...entry,
      id: newId(),
      result: entry.result ?? "ok",
      detail: entry.detail ? JSON.stringify(entry.detail) : null,
      createdAt: now(),
    });

export async function writeAudit(
  db: D1Database,
  entry: AuditEntry,
): Promise<void> {
  await auditStatement(db, entry);
}

export type AuditListQuery = {
  origin?: AuditOrigin;
  action?: string;
  objectId?: string;
  actorUserId?: string;
  from?: number;
  to?: number;
  after?: { id: string; sortValue: number };
  size: number;
};

const olderThan = ({ id, sortValue }: { id: string; sortValue: number }) =>
  or(
    lt(auditLog.createdAt, sortValue),
    and(eq(auditLog.createdAt, sortValue), lt(auditLog.id, id)),
  );

export const selectAuditEntries = (
  db: D1Database,
  scope: Scope,
  {
    origin,
    action,
    objectId,
    actorUserId,
    from,
    to,
    after,
    size,
  }: AuditListQuery,
) =>
  drizzle(db)
    .select({
      id: auditLog.id,
      actorEmail: sql<
        string | null
      >`CASE WHEN ${auditLog.actorType} = 'superadmin'
        THEN NULL ELSE ${users.email} END`,
      origin: sql<AuditOrigin>`${auditLog.origin}`,
      action: auditLog.action,
      objectType: auditLog.objectType,
      objectMetaId: auditLog.objectMetaId,
      objectName: auditLog.objectName,
      result: sql<AuditResult>`${auditLog.result}`,
      detail: auditLog.detail,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(
      and(
        inWorkspace(auditLog, scope),
        origin ? eq(auditLog.origin, origin) : undefined,
        action ? eq(auditLog.action, action) : undefined,
        objectId ? eq(auditLog.objectMetaId, objectId) : undefined,
        actorUserId ? eq(auditLog.actorUserId, actorUserId) : undefined,
        from === undefined ? undefined : gte(auditLog.createdAt, from),
        to === undefined ? undefined : lte(auditLog.createdAt, to),
        after ? olderThan(after) : undefined,
      ),
    )
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(size + 1);

export type AuditRow = Awaited<ReturnType<typeof selectAuditEntries>>[number];
