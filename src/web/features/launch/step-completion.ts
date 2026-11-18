import type { PartialLaunchDraft } from "../../../shared/schemas/launch";

export const isAccountStepComplete = ({
  adAccountAssetId,
  pageId,
  pixelId,
}: PartialLaunchDraft) => Boolean(adAccountAssetId && pageId && pixelId);

export function reachableStepCount(
  steps: { isComplete: (draft: PartialLaunchDraft) => boolean }[],
  draft: PartialLaunchDraft,
) {
  const firstIncomplete = steps.findIndex((step) => !step.isComplete(draft));
  return firstIncomplete === -1 ? steps.length : firstIncomplete + 1;
}
