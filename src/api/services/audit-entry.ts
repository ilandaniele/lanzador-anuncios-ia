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
