import type { AuditEntryDto, ListAuditQuery } from "../../shared/schemas/audit";
import { decodeNumericCursor, paginate } from "../lib/cursor";
import { selectAuditEntries, type AuditRow } from "../repositories/audit";
import type { Scope } from "../repositories/scope";

const toAuditEntryDto = (row: AuditRow): AuditEntryDto => ({
  id: row.id,
  actorEmail: row.actorEmail,
  origin: row.origin,
  action: row.action,
  objectType: row.objectType,
  objectId: row.objectMetaId,
  objectName: row.objectName,
  result: row.result,
  detail: row.detail === null ? null : JSON.parse(row.detail),
  createdAt: new Date(row.createdAt).toISOString(),
});

export async function listAudit(
  db: D1Database,
  scope: Scope,
  {
    origin,
    action,
    objectId,
    actorUserId,
    from,
    to,
    cursor,
    limit,
  }: ListAuditQuery,
) {
  const page = paginate(
    await selectAuditEntries(db, scope, {
      origin,
      action,
      objectId,
      actorUserId,
      from: from === undefined ? undefined : Date.parse(from),
      to: to === undefined ? undefined : Date.parse(to),
      after: cursor ? decodeNumericCursor(cursor) : undefined,
      size: limit,
    }),
    limit,
    (row) => row.createdAt,
  );
  return {
    data: page.rows.map(toAuditEntryDto),
    nextCursor: page.nextCursor,
  };
}
