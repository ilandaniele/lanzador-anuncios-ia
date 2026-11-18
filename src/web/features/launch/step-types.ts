import type { PartialLaunchDraft } from "../../../shared/schemas/launch";

export type StepProps = {
  workspaceId: string;
  draft: PartialLaunchDraft;
  update: (changes: PartialLaunchDraft) => void;
  setBlockReason: (reason: string | null) => void;
};
