import type { WorkflowStep } from "cloudflare:workers";
import type { Env } from "../../api/env";
import type { AuditEntry } from "../../api/repositories/audit";
import { findLaunchRun } from "../../api/repositories/launch-run";
import { findProduct } from "../../api/repositories/products";
import type { Scope } from "../../api/repositories/scope";
import type { LaunchParams } from "../../api/services/launch/launch-instance";
import { parseCompleteDraft } from "../../api/services/launch/simulate";
import { getGraphForAsset } from "../../api/services/meta/connection";
import { getSettings } from "../../api/services/settings";
import { launchPlanSchema } from "../../shared/schemas/launch";
import { SubrequestBudget } from "../lib/subrequest-budget";

export type LaunchContext = Awaited<ReturnType<typeof loadLaunchContext>>;

export interface CreatedObject {
  action: string;
  objectType: string;
  objectMetaId: string;
  objectName?: string;
}

type LaunchRef = Pick<LaunchParams, "launchId" | "workspaceId" | "userId">;

export const launchScope = ({ workspaceId, userId }: LaunchRef): Scope => ({
  workspaceId,
  userId,
  role: "editor",
});

async function loadLaunch(env: Env, scope: Scope, launchId: string) {
  const launch = await findLaunchRun(env.DB, scope, launchId);
  if (!launch?.plan || launch.startedAt === null) {
    throw new Error(`Launch ${launchId} is not started`);
  }
  return {
    ...launch,
    startedAt: launch.startedAt,
    draft: parseCompleteDraft(launch.draft),
    plan: launchPlanSchema.parse(JSON.parse(launch.plan)),
  };
}

async function loadInputs(env: Env, scope: Scope, launchId: string) {
  const launch = await loadLaunch(env, scope, launchId);
  const [settings, product, { graph, asset }] = await Promise.all([
    getSettings(env.DB, scope),
    findProduct(env.DB, scope, launch.draft.productId),
    getGraphForAsset(env.DB, env, scope, launch.draft.adAccountAssetId),
  ]);
  if (!product) throw new Error(`Product of launch ${launchId} is missing`);
  return { launch, settings, product, graph, asset };
}

export async function loadLaunchContext(
  env: Env,
  step: WorkflowStep,
  params: LaunchRef,
) {
  const scope = launchScope(params);
  const inputs = await loadInputs(env, scope, params.launchId);
  return {
    ...inputs,
    env,
    step,
    scope,
    launchId: params.launchId,
    actId: inputs.asset.metaId,
    budget: new SubrequestBudget(),
  };
}

export const launchAudit = (
  { scope, launchId, actId }: LaunchContext,
  object: CreatedObject,
): AuditEntry => ({
  workspaceId: scope.workspaceId,
  actorUserId: scope.userId,
  actorType: "user",
  origin: "manual",
  launchId,
  adAccountMetaId: actId,
  ...object,
});
