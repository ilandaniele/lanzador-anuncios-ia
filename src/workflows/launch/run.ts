import type { WorkflowStep } from "cloudflare:workers";
import type { Env } from "../../api/env";
import { setLaunchPhase } from "../../api/repositories/launch-run";
import type { LaunchParams } from "../../api/services/launch/launch-instance";
import { verifyLaunchRun } from "../../api/services/launch/verify";
import type { LaunchPhase } from "../../shared/schemas/launch";
import { type LaunchContext, loadLaunchContext } from "./context";
import { createLaunchItems } from "./items";
import { runLaunchStep } from "./step";
import { ensureAdset, ensureCampaign, runPreflight } from "./structure";

const VERIFY_SUBREQUESTS = 8;

const enterPhase = (
  { env, step, scope, launchId }: LaunchContext,
  phase: LaunchPhase,
) =>
  step.do(`phase ${phase}`, () =>
    setLaunchPhase(
      env.DB,
      scope,
      launchId,
      phase === "verify" ? "verifying" : "running",
      phase,
    ),
  );

async function createStructure(context: LaunchContext) {
  await enterPhase(context, "preflight");
  await runPreflight(context);
  await enterPhase(context, "campaign");
  const campaignId = await ensureCampaign(context);
  await enterPhase(context, "adset");
  const adsetId = await ensureAdset(context, campaignId);
  await enterPhase(context, "items");
  return adsetId;
}

async function verifyStructure(context: LaunchContext) {
  await enterPhase(context, "verify");
  const { env, step, scope, launchId, budget } = context;
  return runLaunchStep(
    step,
    "verify",
    () => verifyLaunchRun(env, scope, launchId),
    { budget, subrequests: VERIFY_SUBREQUESTS },
  );
}

export async function runLaunch(
  env: Env,
  step: WorkflowStep,
  params: LaunchParams,
) {
  const context = await loadLaunchContext(env, step, params);
  const adsetId =
    params.segment === 0
      ? await createStructure(context)
      : context.launch.metaAdsetId!;
  const finished = await createLaunchItems(context, params, adsetId);
  if (finished) await verifyStructure(context);
}
