import { drizzle } from "drizzle-orm/d1";
import { auditLog } from "../../db/schema/ops";
import type {
  AuditActorType,
  AuditOrigin,
  AuditResult,
} from "../../shared/constants";
import { newId } from "../lib/ids";
import { now } from "../lib/time";

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
