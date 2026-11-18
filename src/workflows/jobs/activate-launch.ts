import { NonRetryableError } from "cloudflare:workflows";
import { z } from "zod";
import type { Env } from "../../api/env";
import { readStatuses } from "../../api/integrations/meta/launch-read";
import {
  type ActivationTarget,
  activateBatch,
} from "../../api/integrations/meta/write";
import { now } from "../../api/lib/time";
import type { AuditEntry } from "../../api/repositories/audit";
import {
  type ActivationResult,
  findActivationTargets,
  finishActivation,
} from "../../api/repositories/launch-activate";
import type { Scope } from "../../api/repositories/scope";
import { parseCompleteDraft } from "../../api/services/launch/simulate";
import { getGraphForAsset } from "../../api/services/meta/connection";
import { LAUNCH_STATUSES } from "../../shared/constants";
import { launchFailure } from "../launch/failure";
import { runLaunchStep } from "../launch/step";
import { JOB_STEP_CONFIG, type JobHandler } from "./job-context";

const payloadSchema = z.object({
  launchId: z.string().min(1),
  userId: z.string().min(1),
  fromStatus: z.enum(LAUNCH_STATUSES),
  startAt: z.iso.datetime().nullable(),
});

type ActivateJob = z.infer<typeof payloadSchema>;
type Targets = NonNullable<Awaited<ReturnType<typeof loadTargets>>>;

async function loadTargets(env: Env, scope: Scope, launchId: string) {
  const launch = await findActivationTargets(env.DB, scope, launchId);
  if (!launch) return null;
  const objects: ActivationTarget[] = [
    ...(launch.metaCampaignId
      ? [{ id: launch.metaCampaignId, kind: "campaign" as const }]
      : []),
    ...(launch.metaAdsetId
      ? [{ id: launch.metaAdsetId, kind: "adset" as const }]
      : []),
    ...launch.adIds.map((id) => ({ id, kind: "ad" as const })),
  ];
  return {
    adAccountAssetId: parseCompleteDraft(launch.draft).adAccountAssetId,
    adAccountMetaId: launch.adAccountMetaId,
    objects,
  };
}

const graphFor = (env: Env, scope: Scope, targets: Targets) =>
  getGraphForAsset(env.DB, env, scope, targets.adAccountAssetId).then(
    ({ graph }) => graph,
  );

async function activate(
  env: Env,
  scope: Scope,
  targets: Targets,
  job: ActivateJob,
) {
  const graph = await graphFor(env, scope, targets);
  await activateBatch(graph, targets.objects, job.startAt ?? undefined);
  return null;
}

async function countActive(env: Env, scope: Scope, targets: Targets) {
  const graph = await graphFor(env, scope, targets);
  const ids = targets.objects.map(({ id }) => id);
  const statuses = await readStatuses(graph, ids);
  return statuses.filter((status) => status === "ACTIVE").length;
}

function activationResult(
  job: ActivateJob,
  active: number,
  total: number,
): ActivationResult {
  if (active < total) {
    return {
      status: job.fromStatus,
      startAt: null,
      failure: {
        errorCode: "META_ERROR",
        errorMessage: `Se activaron ${active} de ${total}. Volvé a tocar Activar.`,
      },
    };
  }
  const startAt = job.startAt ? Date.parse(job.startAt) : null;
  const scheduled = startAt !== null && startAt > now();
  return { status: scheduled ? "scheduled" : "active", startAt, failure: null };
}

const activationAudit = (
  scope: Scope,
  job: ActivateJob,
  targets: Targets,
  { status, failure }: ActivationResult,
): AuditEntry => ({
  workspaceId: scope.workspaceId,
  actorUserId: scope.userId,
  actorType: "user",
  origin: "manual",
  action: "meta.launch.activate",
  launchId: job.launchId,
  adAccountMetaId: targets.adAccountMetaId ?? undefined,
  result: failure ? "error" : "ok",
  detail: { status, startAt: job.startAt, error: failure?.errorMessage },
});

export const activateLaunchJob: JobHandler = async ({
  env,
  step,
  workspaceId,
  payload,
}) => {
  const parsed = payloadSchema.safeParse(payload);
  if (!workspaceId || !parsed.success) {
    throw new NonRetryableError("Invalid activate_launch job");
  }
  const job = parsed.data;
  const scope: Scope = { workspaceId, userId: job.userId, role: "editor" };
  const finish = (name: string, targets: Targets, result: ActivationResult) =>
    step.do(name, JOB_STEP_CONFIG, () =>
      finishActivation(
        env.DB,
        scope,
        job.launchId,
        result,
        activationAudit(scope, job, targets, result),
      ),
    );

  const targets = await step.do("load targets", JOB_STEP_CONFIG, () =>
    loadTargets(env, scope, job.launchId),
  );
  if (!targets) return;
  try {
    await runLaunchStep(
      step,
      "activate",
      () => activate(env, scope, targets, job),
      {},
    );
    const active = await runLaunchStep(
      step,
      "verify active",
      () => countActive(env, scope, targets),
      {},
    );
    await finish(
      "finish",
      targets,
      activationResult(job, active, targets.objects.length),
    );
  } catch (error) {
    await finish("restore", targets, {
      status: job.fromStatus,
      startAt: null,
      failure: launchFailure(error),
    });
    throw error;
  }
};
