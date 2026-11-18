import type { NewPilotProposal } from "../../repositories/pilot";
import type { PilotPromptProposal } from "../ai/prompts/pilot";
import type { ProposalDraft } from "./types";

export interface DraftEntry {
  id: string;
  draft: ProposalDraft;
}

export const toPromptProposal = ({
  id,
  draft,
}: DraftEntry): PilotPromptProposal => ({
  id,
  ruleType: draft.ruleType,
  action: draft.action,
  level: draft.level,
  objectName: draft.objectName,
  evidence: draft.evidence,
  currentBudgetMinor: draft.currentBudgetMinor,
  proposedBudgetMinor: draft.proposedBudgetMinor,
  percent: draft.percent,
});

export const toNewProposal = (
  { id, draft }: DraftEntry,
  context: {
    workspaceId: string;
    runId: string;
    explanation: string | undefined;
    createdAt: number;
  },
): NewPilotProposal => ({
  id,
  workspaceId: context.workspaceId,
  runId: context.runId,
  ruleType: draft.ruleType,
  action: draft.action,
  adAccountMetaId: draft.adAccountId,
  objectLevel: draft.level,
  objectMetaId: draft.objectId,
  objectName: draft.objectName,
  evidence: JSON.stringify(draft.evidence),
  currentBudgetMinor: draft.currentBudgetMinor,
  proposedBudgetMinor: draft.proposedBudgetMinor,
  percent: draft.percent,
  explanation: context.explanation ?? null,
  dedupeKey: draft.dedupeKey,
  expiresAt: draft.expiresAt,
  createdAt: context.createdAt,
});
