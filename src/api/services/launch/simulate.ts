import { launchDraftSchema } from "../../../shared/schemas/launch";
import type { LaunchDraft, LaunchPlan } from "../../../shared/schemas/launch";
import type { Env } from "../../env";
import type { Graph } from "../../integrations/meta/client";
import {
  getCampaignReference,
  readAccountHealth,
} from "../../integrations/meta/read";
import { AppError, conflict, notFound } from "../../lib/errors";
import { selectCreativeFacts } from "../../repositories/creatives";
import {
  findEditableLaunchDraft,
  saveLaunchPlan,
} from "../../repositories/launches";
import { findProduct } from "../../repositories/products";
import type { Scope } from "../../repositories/scope";
import { findMaxCreativesPerLaunch } from "../../repositories/workspaces";
import { assertAssetAccount, getGraphForAsset } from "../meta/connection";
import { rethrowMetaError } from "../meta/meta-error";
import { getSettings } from "../settings";
import { throwWhyNotEditable } from "./drafts";
import { buildLaunchPlan } from "./plan";

function parseCompleteDraft(stored: string): LaunchDraft {
  const result = launchDraftSchema.safeParse(JSON.parse(stored));
  if (!result.success) {
    const fields = Object.fromEntries(
      result.error.issues.map((issue) => [issue.path.join("."), issue.code]),
    );
    throw new AppError(422, "BLOCKERS", { fields });
  }
  return result.data;
}

async function loadLocalInputs(
  db: D1Database,
  scope: Scope,
  draft: LaunchDraft,
) {
  const creativeIds = draft.items.flatMap(({ creativeId }) => creativeId ?? []);
  const [settings, product, maxItems, creatives] = await Promise.all([
    getSettings(db, scope),
    findProduct(db, scope, draft.productId),
    findMaxCreativesPerLaunch(db, scope),
    selectCreativeFacts(db, scope, creativeIds),
  ]);
  if (!product || maxItems === null) throw notFound();
  return {
    settings,
    product,
    maxItems,
    creatives: new Map(creatives.map((creative) => [creative.id, creative])),
  };
}

async function readMeta(
  graph: Graph,
  asset: { metaId: string },
  draft: LaunchDraft,
) {
  const campaignId =
    draft.mode === "existing_cbo" ? draft.existingCampaignId : undefined;
  const [health, reference] = await Promise.all([
    readAccountHealth(graph, asset.metaId),
    campaignId ? getCampaignReference(graph, campaignId) : undefined,
  ]).catch(rethrowMetaError);
  if (reference) assertAssetAccount(asset, reference.accountId);
  return { health, reference };
}

export async function simulateLaunch(
  env: Env,
  scope: Scope,
  id: string,
): Promise<LaunchPlan> {
  const stored = await findEditableLaunchDraft(env.DB, scope, id);
  if (!stored) return throwWhyNotEditable(env.DB, scope, id);
  const draft = parseCompleteDraft(stored.draft);
  const [local, { graph, asset }] = await Promise.all([
    loadLocalInputs(env.DB, scope, draft),
    getGraphForAsset(env.DB, env, scope, draft.adAccountAssetId),
  ]);
  const plan = await buildLaunchPlan({
    ...local,
    ...(await readMeta(graph, asset, draft)),
    draft,
    at: stored.updatedAt,
  });
  const saved = await saveLaunchPlan(
    env.DB,
    scope,
    id,
    { plan: JSON.stringify(plan), planHash: plan.planHash },
    stored.updatedAt,
  );
  if (!saved) throw conflict("PLAN_CHANGED");
  return plan;
}
