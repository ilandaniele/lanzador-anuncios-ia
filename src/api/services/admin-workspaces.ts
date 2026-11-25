import { WORKSPACE_PURGE_DELAY_MS } from "../../shared/constants";
import type {
  AdminWorkspaceDto,
  AdminWorkspacesQuery,
  PatchAdminWorkspace,
} from "../../shared/schemas/admin";
import { decodeCursor, paginate } from "../lib/cursor";
import { AppError, notFound, unprocessable } from "../lib/errors";
import { now, toIsoOrNull, utcPeriods } from "../lib/time";
import {
  type AdminWorkspaceRow,
  findWorkspaceState,
  selectWorkspacesPage,
  updateAdminWorkspace,
  type WorkspaceChanges,
  type WorkspaceState,
} from "../repositories/admin-workspaces";
import type { SessionUser } from "../types";
import { superadminAuditEntry } from "./audit-entry";

const toAdminWorkspaceDto = (row: AdminWorkspaceRow): AdminWorkspaceDto => ({
  id: row.id,
  name: row.name,
  status: row.status,
  planId: row.planId,
  ownerEmail: row.ownerEmail,
  metaStatus: row.metaStatus,
  memberCount: row.memberCount,
  lastActivityAt: toIsoOrNull(row.lastActivityAt),
  createdAt: new Date(row.createdAt).toISOString(),
  aiNeuronsMonth: row.aiNeuronsMonth,
});

const isRestorable = (state: WorkspaceState, at: number) =>
  state.deletedAt !== null && at - state.deletedAt <= WORKSPACE_PURGE_DELAY_MS;

function statusChanges(
  { status, disabledReason }: PatchAdminWorkspace,
  state: WorkspaceState,
  at: number,
): WorkspaceChanges {
  if (status === undefined) return {};
  if (state.status === "deleting") {
    const allowed = status === "active" && isRestorable(state, at);
    if (!allowed) throw unprocessable("INVALID_STATUS", { status: "locked" });
  }
  return status === "disabled"
    ? { status, disabledReason: disabledReason ?? null }
    : { status, disabledReason: null, deletedAt: null };
}

export async function listAdminWorkspaces(
  db: D1Database,
  { cursor, limit, status }: AdminWorkspacesQuery,
) {
  const after = cursor ? decodeCursor(cursor).id : undefined;
  const page = paginate(
    await selectWorkspacesPage(db, utcPeriods(now()).month, {
      status,
      after,
      size: limit,
    }),
    limit,
  );
  return {
    data: page.rows.map(toAdminWorkspaceDto),
    nextCursor: page.nextCursor,
  };
}

export async function patchAdminWorkspace(
  db: D1Database,
  admin: SessionUser,
  id: string,
  patch: PatchAdminWorkspace,
  requestId: string,
) {
  const state = await findWorkspaceState(db, id);
  if (!state) throw notFound();

  const at = now();
  const { planId, aiDailyNeuronsOverride, aiMonthlyNeuronsOverride } = patch;
  const audits =
    patch.status === "disabled"
      ? [
          superadminAuditEntry(id, admin.id, requestId, {
            action: "workspace.disable",
            objectType: "workspace",
            detail: { reason: patch.disabledReason ?? null },
          }),
        ]
      : [];
  const row = await updateAdminWorkspace(
    db,
    id,
    {
      changes: {
        ...statusChanges(patch, state, at),
        planId,
        aiDailyNeuronsOverride,
        aiMonthlyNeuronsOverride,
      },
      month: utcPeriods(at).month,
      at,
    },
    audits,
  );
  if (row === "WORKSPACE_LIMIT") throw unprocessable("WORKSPACE_LIMIT");
  if (!row) {
    throw new AppError(400, "VALIDATION", { fields: { planId: "unknown" } });
  }
  return { workspace: toAdminWorkspaceDto(row) };
}
