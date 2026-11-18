import type { LaunchItem } from "../../repositories/launch-items";
import type { LaunchFailure } from "../../repositories/launch-run";
import type { CreativeMedia } from "./payloads";
import { MEDIA_NOT_IN_ACCOUNT_TEXT } from "./plan-lines";

export type ItemMedia = { media: CreativeMedia } | { failure: LaunchFailure };

const failed = (errorCode: string, errorMessage: string): ItemMedia => ({
  failure: { errorCode, errorMessage },
});

export function resolveItemMedia(
  item: LaunchItem,
  adAccountAssetId: string,
): ItemMedia {
  if (item.cloneStoryId) {
    return { media: { kind: "story", storyId: item.cloneStoryId } };
  }
  if (item.creativeAccountId && item.creativeAccountId !== adAccountAssetId) {
    return failed("MEDIA_NOT_IN_ACCOUNT", MEDIA_NOT_IN_ACCOUNT_TEXT);
  }
  if (item.kind === "image" && item.metaImageHash) {
    return { media: { kind: "image", imageHash: item.metaImageHash } };
  }
  if (item.kind === "video" && item.metaVideoId && item.thumbnailUrl) {
    return {
      media: {
        kind: "video",
        videoId: item.metaVideoId,
        thumbnailUrl: item.thumbnailUrl,
      },
    };
  }
  return failed("CREATIVE_NOT_READY", "El creativo no terminó");
}
