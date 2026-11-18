import type { PartialLaunchDraft } from "../../../shared/schemas/launch";

export const isStructureStepComplete = ({
  mode,
  existingCampaignId,
  campaignName,
  adsetName,
}: PartialLaunchDraft) =>
  Boolean(
    campaignName &&
    adsetName &&
    (mode === "new_cbo" || (mode === "existing_cbo" && existingCampaignId)),
  );
