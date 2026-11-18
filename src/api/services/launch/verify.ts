import { isLaunchInFlight } from "../../../shared/launch-status";
import type { LaunchStatus } from "../../../shared/schemas/launch";
import type { Env } from "../../env";
import { readLaunchObjects } from "../../integrations/meta/launch-read";
import { conflict, notFound } from "../../lib/errors";
import { now } from "../../lib/time";
import {
  findLaunchForVerify,
  type LaunchForVerify,
  saveVerification,
} from "../../repositories/launch-verify";
import { findProduct } from "../../repositories/products";
import type { Scope } from "../../repositories/scope";
import { checkLanding } from "../landing-check";
import { getGraphForAsset } from "../meta/connection";
import { rethrowMetaError } from "../meta/meta-error";
import { getSettings } from "../settings";
import { buildLaunchChecks } from "./verify-checks";
import { parseCompleteDraft } from "./simulate";

const VERIFIED_STATUSES: readonly LaunchStatus[] = [
  "paused_verified",
  "verified_with_errors",
];
const WORKFLOW_STATUSES: readonly LaunchStatus[] = ["verifying"];

const builtItems = (launch: LaunchForVerify) =>
  launch.items.filter((item) => item.status !== "failed");

const uniqueIds = (ids: (string | null)[]) => [
  ...new Set(ids.filter((id): id is string => id !== null)),
];

async function runChecks(env: Env, scope: Scope, launch: LaunchForVerify) {
  const draft = parseCompleteDraft(launch.draft);
  const campaignId = launch.metaCampaignId ?? draft.existingCampaignId;
  if (!campaignId || !launch.metaAdsetId) throw conflict("LAUNCH_RUNNING");
  const [settings, product, { graph }] = await Promise.all([
    getSettings(env.DB, scope),
    findProduct(env.DB, scope, draft.productId),
    getGraphForAsset(env.DB, env, scope, draft.adAccountAssetId),
  ]);
  if (!product) throw notFound();
  const items = builtItems(launch);
  const [objects, landing] = await Promise.all([
    readLaunchObjects(graph, {
      campaignId,
      adsetId: launch.metaAdsetId,
      videoIds: uniqueIds(items.map((item) => item.metaVideoId)),
    }),
    checkLanding(product.landingUrl, fetch, {
      blockedHosts: [new URL(env.APP_ORIGIN).hostname],
    }),
  ]);
  return buildLaunchChecks(objects, {
    draft,
    advantageCreativeEnabled: settings.advantageCreativeEnabled,
    landingUrl: product.landingUrl,
    landingUp: landing.status !== "error",
    expectedAds: items.length,
    storyIds: uniqueIds(items.map((item) => item.cloneStoryId)),
    now: now(),
  });
}

async function verify(
  env: Env,
  scope: Scope,
  launch: LaunchForVerify & { id: string },
  fromStatuses: readonly LaunchStatus[],
) {
  const checks = await runChecks(env, scope, launch);
  const checksOk = checks.every((check) => check.ok);
  const status: LaunchStatus =
    checksOk && launch.itemsFailed === 0
      ? "paused_verified"
      : "verified_with_errors";
  const saved = await saveVerification(env.DB, scope, launch.id, {
    attempt: launch.attempt,
    fromStatuses,
    status,
    checks,
    checksOk,
  });
  return { saved, status, checksOk, checks };
}

export async function verifyLaunchRun(env: Env, scope: Scope, id: string) {
  const launch = await findLaunchForVerify(env.DB, scope, id);
  if (!launch) throw notFound();
  const { status } = await verify(
    env,
    scope,
    { ...launch, id },
    WORKFLOW_STATUSES,
  );
  return status;
}

export async function reverifyLaunch(env: Env, scope: Scope, id: string) {
  const launch = await findLaunchForVerify(env.DB, scope, id);
  if (!launch) throw notFound();
  if (isLaunchInFlight(launch.status)) throw conflict("LAUNCH_RUNNING");
  if (!VERIFIED_STATUSES.includes(launch.status)) throw conflict("NOT_PAUSED");
  const { saved, ...result } = await verify(
    env,
    scope,
    { ...launch, id },
    VERIFIED_STATUSES,
  ).catch(rethrowMetaError);
  if (!saved) throw conflict("LAUNCH_RUNNING");
  return result;
}
