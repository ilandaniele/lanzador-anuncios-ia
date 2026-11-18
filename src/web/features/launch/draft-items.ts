import type { CreativeDto } from "../../../shared/schemas/creatives";
import type { PartialLaunchDraft } from "../../../shared/schemas/launch";
import type { CampaignAdDto } from "../../../shared/schemas/meta-campaigns";

export type DraftItem = NonNullable<PartialLaunchDraft["items"]>[number];

const AD_NAME_MAX = 120;

export const itemKey = ({ creativeId, cloneAdId }: DraftItem) =>
  creativeId ? `creative-${creativeId}` : `clone-${cloneAdId}`;

export const itemFromCreative = ({
  id,
  name,
  kind,
}: CreativeDto): DraftItem => ({
  source: "upload",
  creativeId: id,
  adName: name.slice(0, AD_NAME_MAX),
  mediaKind: kind,
});

export const itemFromAd = ({
  adId,
  name,
  storyId,
}: Pick<CampaignAdDto, "adId" | "name" | "storyId">): DraftItem => ({
  source: "clone",
  cloneAdId: adId,
  ...(storyId ? { cloneStoryId: storyId } : {}),
  adName: name.slice(0, AD_NAME_MAX),
});

export const hasCreative = (items: DraftItem[], creativeId: string) =>
  items.some((item) => item.creativeId === creativeId);

export const mixesMediaKinds = (
  items: DraftItem[],
  kind: CreativeDto["kind"],
) => items.some((item) => item.mediaKind && item.mediaKind !== kind);

export function moveItem(items: DraftItem[], from: number, to: number) {
  if (from === to || to < 0 || to >= items.length) return items;
  const next = [...items];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}
