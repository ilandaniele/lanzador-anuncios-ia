import type { AuditEntry } from "../repositories/audit";
import type { Scope } from "../repositories/scope";

export const manualAuditEntry = (
  scope: Scope,
  requestId: string,
  entry: Pick<AuditEntry, "action" | "objectType" | "objectName" | "detail">,
): AuditEntry => ({
  workspaceId: scope.workspaceId,
  actorUserId: scope.userId,
  actorType: "user",
  origin: "manual",
  requestId,
  ...entry,
});

export const superadminAuditEntry = (
  workspaceId: string,
  actorUserId: string,
  requestId: string,
  entry: Pick<AuditEntry, "action" | "objectType" | "objectName" | "detail">,
): AuditEntry => ({
  workspaceId,
  actorUserId,
  actorType: "superadmin",
  origin: "manual",
  requestId,
  ...entry,
});
