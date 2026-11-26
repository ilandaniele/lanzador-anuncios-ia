import { FREE_PLAN_ID, TRIAL_MS, TRIAL_PLAN_ID } from "../../shared/billing";
import {
  MAX_OWNED_WORKSPACES,
  WORKSPACE_PURGE_DELAY_MS,
} from "../../shared/constants";
import type {
  WorkspaceDto,
  WorkspaceOverview,
} from "../../shared/schemas/workspaces";
import type { Env } from "../env";
import { notFound, unprocessable } from "../lib/errors";
import { newId } from "../lib/ids";
import { now, utcPeriods } from "../lib/time";
import type { Scope } from "../repositories/scope";
import { selectOpenSubscriptions } from "../repositories/subscriptions";
import {
  findCreationEligibility,
  findOverview,
  findWorkspaceName,
  insertWorkspaceWithDefaults,
  markWorkspaceDeleting,
  renameWorkspace,
} from "../repositories/workspaces";
import type { SessionUser } from "../types";
import { buildAiUsage, resolveAiCaps } from "./ai-usage";
import { manualAuditEntry } from "./audit-entry";
import { cancelOpenSubscriptions } from "./billing/cancel-open";

type WorkspaceRow = Omit<WorkspaceDto, "createdAt"> & { createdAt: number };

export const toWorkspaceDto = (row: WorkspaceRow): WorkspaceDto => ({
  id: row.id,
  name: row.name,
  planId: row.planId,
  status: row.status,
  createdAt: new Date(row.createdAt).toISOString(),
});

export async function createWorkspace(
  db: D1Database,
  user: SessionUser,
  name: string,
) {
  const eligibility = await findCreationEligibility(db, user.id, user.email);
  if (eligibility.ownedCount >= MAX_OWNED_WORKSPACES) {
    throw unprocessable("WORKSPACE_LIMIT");
  }
  const at = now();
  const planId =
    user.isSuperadmin || eligibility.invited ? FREE_PLAN_ID : TRIAL_PLAN_ID;
  const trialEndsAt =
    planId === FREE_PLAN_ID
      ? null
      : (eligibility.trialStartedAt ?? at) + TRIAL_MS;
  const workspace = await insertWorkspaceWithDefaults(
    db,
    { id: newId(), name, ownerUserId: user.id, at, planId, trialEndsAt },
    user.email,
  );
  if (!workspace) throw unprocessable("WORKSPACE_LIMIT");
  return { workspace: toWorkspaceDto(workspace), role: "owner" as const };
}

export async function getWorkspaceOverview(
  env: Env,
  scope: Scope,
): Promise<WorkspaceOverview> {
  const periods = utcPeriods(now());
  const overview = await findOverview(env.DB, scope, periods);
  if (!overview) throw notFound();
  const { workspace, settings, neurons } = overview;
  const { plan } = workspace;
  return {
    workspace: toWorkspaceDto(workspace),
    role: scope.role,
    plan: {
      id: workspace.planId,
      name: plan.name,
      limits: {
        maxMembers: plan.maxMembers,
        maxAdAccounts: plan.maxAdAccounts,
        maxCreativesPerLaunch: plan.maxCreativesPerLaunch,
        aiDailyNeurons: plan.aiDailyNeurons,
        aiMonthlyNeurons: plan.aiMonthlyNeurons,
      },
    },
    settings,
    aiUsage: buildAiUsage({
      ...resolveAiCaps(workspace),
      globalCap: env.WORKERS_AI_DAILY_NEURON_CAP,
      neurons,
      resetsAt: periods.nextDayAt,
    }),
  };
}

export async function updateWorkspaceName(
  db: D1Database,
  scope: Scope,
  name: string,
) {
  const workspace = await renameWorkspace(db, scope, name, now());
  if (!workspace) throw notFound();
  return { workspace: toWorkspaceDto(workspace) };
}

export async function deleteWorkspace(
  env: Env,
  scope: Scope,
  confirmName: string,
  requestId: string,
) {
  const name = await findWorkspaceName(env.DB, scope);
  if (name === null) throw notFound();
  if (confirmName !== name) throw unprocessable("CONFIRM_MISMATCH");
  await cancelOpenSubscriptions(
    env,
    scope,
    requestId,
    await selectOpenSubscriptions(env.DB, scope),
  );
  const at = now();
  const audit = manualAuditEntry(scope, requestId, {
    action: "workspace.delete",
    objectType: "workspace",
    objectName: name,
  });
  await markWorkspaceDeleting(env.DB, scope, audit, at);
  return { purgeAfter: new Date(at + WORKSPACE_PURGE_DELAY_MS).toISOString() };
}
