import type { WorkflowStep } from "cloudflare:workers";
import type { Env } from "../../api/env";
import { findCreatedByName } from "../../api/integrations/meta/lookup";
import { createAd, createAdCreative } from "../../api/integrations/meta/write";
import {
  findLaunchItem,
  type LaunchItem,
} from "../../api/repositories/launch-items";
import {
  completeItem,
  failItem,
  type LaunchFailure,
  saveItemCreative,
} from "../../api/repositories/launch-run";
import { resolveItemMedia } from "../../api/services/launch/item";
import {
  type LaunchItemParams,
  notifyLaunch,
} from "../../api/services/launch/item-instance";
import {
  buildAdPayload,
  buildCreativePayload,
  type CreativeMedia,
} from "../../api/services/launch/payloads";
import {
  type LaunchContext,
  launchAudit,
  launchScope,
  loadLaunchContext,
} from "./context";
import { launchFailure } from "./failure";
import { runLaunchStep } from "./step";

const AD_SUBREQUESTS = 2;

function createCreative(
  context: LaunchContext,
  item: LaunchItem,
  media: CreativeMedia,
) {
  const { env, step, scope, budget, graph, actId, launch, product } = context;
  const { draft } = launch;
  return runLaunchStep(
    step,
    `creative ${item.id}`,
    async () => {
      const payload = buildCreativePayload(
        {
          adName: item.adName,
          pageId: draft.pageId,
          instagramUserId: draft.instagramUserId,
        },
        product,
        draft.copy,
        media,
        context.settings,
      );
      const { id } = await createAdCreative(graph, actId, payload);
      await saveItemCreative(
        env.DB,
        scope,
        item.id,
        id,
        launchAudit(context, {
          action: "launch.creative.create",
          objectType: "creative",
          objectMetaId: id,
          objectName: item.adName,
        }),
      );
      return id;
    },
    { budget },
  );
}

function createItemAd(
  context: LaunchContext,
  item: LaunchItem,
  adsetId: string,
  creativeId: string,
) {
  const { env, step, scope, launchId, budget, graph, actId, launch } = context;
  return runLaunchStep(
    step,
    `ad ${item.id}`,
    async () => {
      const id =
        (await findCreatedByName(
          graph,
          actId,
          "ads",
          item.adName,
          launch.startedAt,
        )) ??
        (
          await createAd(
            graph,
            actId,
            buildAdPayload({
              adName: item.adName,
              adsetId,
              creativeId,
              pixelId: launch.draft.pixelId,
            }),
          )
        ).id;
      await completeItem(
        env.DB,
        scope,
        launchId,
        item.id,
        id,
        launchAudit(context, {
          action: "launch.ad.create",
          objectType: "ad",
          objectMetaId: id,
          objectName: item.adName,
        }),
      );
      return id;
    },
    { budget, subrequests: AD_SUBREQUESTS },
  );
}

async function createItemCreative(context: LaunchContext, item: LaunchItem) {
  if (item.metaCreativeId) return { creativeId: item.metaCreativeId };
  const resolved = resolveItemMedia(
    item,
    context.launch.draft.adAccountAssetId,
  );
  if ("failure" in resolved) return resolved;
  return { creativeId: await createCreative(context, item, resolved.media) };
}

async function createLaunchItem(
  env: Env,
  step: WorkflowStep,
  params: LaunchItemParams,
): Promise<LaunchFailure | null> {
  const context = await loadLaunchContext(env, step, params);
  const item = await step.do("load item", () =>
    findLaunchItem(env.DB, context.scope, params.launchId, params.itemId),
  );
  if (!item) throw new Error(`Launch item ${params.itemId} is missing`);
  const creative = await createItemCreative(context, item);
  if ("failure" in creative) return creative.failure;
  await createItemAd(context, item, params.adsetId, creative.creativeId);
  return null;
}

export async function runLaunchItem(
  env: Env,
  step: WorkflowStep,
  params: LaunchItemParams,
) {
  const failure = await createLaunchItem(env, step, params).catch(
    launchFailure,
  );
  if (failure) {
    await step.do("fail item", () =>
      failItem(
        env.DB,
        launchScope(params),
        params.launchId,
        params.itemId,
        failure,
      ),
    );
  }
  await step.do("notify launch", () => notifyLaunch(env, params));
}
