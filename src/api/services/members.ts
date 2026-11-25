import type { InvitableRole, Role } from "../../shared/constants";
import type { PaginationQuery } from "../../shared/schemas/common";
import type { MemberDto } from "../../shared/schemas/members";
import { decodeCursor, paginate } from "../lib/cursor";
import { AppError, notFound, unprocessable } from "../lib/errors";
import { now } from "../lib/time";
import {
  deleteMember,
  findMember,
  type MemberRow,
  selectMembers,
  setMemberRole,
} from "../repositories/memberships";
import type { Scope } from "../repositories/scope";
import { transferOwnership } from "../repositories/workspaces";
import { manualAuditEntry } from "./audit-entry";
import { toWorkspaceDto } from "./workspaces";

const toMemberDto = (row: MemberRow): MemberDto => ({
  userId: row.userId,
  email: row.email,
  name: row.name,
  role: row.role,
  joinedAt: new Date(row.joinedAt).toISOString(),
});

async function findMemberOrThrow(db: D1Database, scope: Scope, userId: string) {
  const member = await findMember(db, scope, userId);
  if (!member) throw notFound();
  return member;
}

const roleUpdateAudit = (
  scope: Scope,
  requestId: string,
  target: { userId: string; email?: string },
  change: { from: Role; to: Role },
) =>
  manualAuditEntry(scope, requestId, {
    action: "member.role.update",
    objectType: "member",
    objectName: target.email,
    detail: { userId: target.userId, ...change },
  });

export async function listMembers(
  db: D1Database,
  scope: Scope,
  { cursor, limit }: PaginationQuery,
) {
  const after = cursor ? decodeCursor(cursor).id : undefined;
  const page = paginate(
    await selectMembers(db, scope, { after, size: limit }),
    limit,
  );
  return { data: page.rows.map(toMemberDto), nextCursor: page.nextCursor };
}

export async function changeMemberRole(
  db: D1Database,
  scope: Scope,
  change: { userId: string; role: InvitableRole },
  requestId: string,
) {
  const member = await findMemberOrThrow(db, scope, change.userId);
  if (member.role === "owner") throw unprocessable("CANNOT_CHANGE_OWNER");
  await setMemberRole(
    db,
    scope,
    { ...change, at: now() },
    roleUpdateAudit(scope, requestId, member, {
      from: member.role,
      to: change.role,
    }),
  );
  return { member: toMemberDto({ ...member, role: change.role }) };
}

export async function removeMember(
  db: D1Database,
  scope: Scope,
  userId: string,
  requestId: string,
) {
  const member = await findMemberOrThrow(db, scope, userId);
  if (member.role === "owner") throw unprocessable("OWNER_CANNOT_LEAVE");
  await deleteMember(
    db,
    scope,
    userId,
    manualAuditEntry(scope, requestId, {
      action: "member.remove",
      objectType: "member",
      objectName: member.email,
      detail: { userId, role: member.role },
    }),
  );
}

export async function transferWorkspaceOwnership(
  db: D1Database,
  scope: Scope,
  successorId: string,
  requestId: string,
) {
  if (successorId === scope.userId) {
    throw new AppError(400, "VALIDATION", {
      fields: { userId: "already_owner" },
    });
  }
  const successor = await findMember(db, scope, successorId);
  if (!successor) throw unprocessable("NOT_A_MEMBER");
  const workspace = await transferOwnership(
    db,
    scope,
    { successorId, at: now() },
    [
      roleUpdateAudit(scope, requestId, scope, { from: "owner", to: "admin" }),
      roleUpdateAudit(scope, requestId, successor, {
        from: successor.role,
        to: "owner",
      }),
    ],
  );
  if (workspace === "WORKSPACE_LIMIT") throw unprocessable("WORKSPACE_LIMIT");
  if (!workspace) throw unprocessable("NOT_A_MEMBER");
  return { workspace: toWorkspaceDto(workspace) };
}
