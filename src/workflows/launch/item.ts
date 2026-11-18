import { findCreatedByName } from "../../api/integrations/meta/lookup";
import { createAd, createAdCreative } from "../../api/integrations/meta/write";
import { conflict } from "../../api/lib/errors";
import {
  completeItem,
  failItem,
  type PendingItem,
  saveItemCreative,
} from "../../api/repositories/launch-run";
import {
  buildAdPayload,
  buildCreativePayload,
  type CreativeMedia,
} from "../../api/services/launch/payloads";
import { type LaunchContext, launchAudit } from "./context";
import { isItemError, metaErrorMessage } from "./failure";
import { runLaunchStep } from "./step";

const AD_SUBREQUESTS = 2;

function itemMedia(item: PendingItem): CreativeMedia {
  if (item.cloneStoryId) return { kind: "story", storyId: item.cloneStoryId };
  if (item.kind === "image" && item.metaImageHash) {
    return { kind: "image", imageHash: item.metaImageHash };
  }
  if (item.kind === "video" && item.metaVideoId && item.thumbnailUrl) {
    return {
      kind: "video",
      videoId: item.metaVideoId,
      thumbnailUrl: item.thumbnailUrl,
    };
  }
  throw conflict("CREATIVE_NOT_READY");
}

function createCreative(context: LaunchContext, item: PendingItem) {
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
        itemMedia(item),
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
  item: PendingItem,
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

export async function createLaunchItem(
  context: LaunchContext,
  item: PendingItem,
  adsetId: string,
) {
  try {
    const creativeId =
      item.metaCreativeId ?? (await createCreative(context, item));
    await createItemAd(context, item, adsetId, creativeId);
  } catch (error) {
    if (!isItemError(error)) throw error;
    const { env, step, scope, launchId } = context;
    await step.do(`fail item ${item.id}`, () =>
      failItem(env.DB, scope, launchId, item.id, {
        errorCode: "META_ERROR",
        errorMessage: metaErrorMessage(error),
      }),
    );
  }
}
