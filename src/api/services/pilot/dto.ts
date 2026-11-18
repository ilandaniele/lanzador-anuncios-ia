import type {
  PilotProposalDto,
  PilotRunDto,
} from "../../../shared/schemas/pilot";
import { toIsoOrNull } from "../../lib/time";
import type { PilotProposalRow, PilotRunRow } from "../../repositories/pilot";

const iso = (at: number) => new Date(at).toISOString();

export const toPilotRunDto = (row: PilotRunRow): PilotRunDto => ({
  id: row.id,
  trigger: row.trigger as PilotRunDto["trigger"],
  status: row.status as PilotRunDto["status"],
  proposalsCreated: row.proposalsCreated,
  startedAt: iso(row.startedAt),
  finishedAt: toIsoOrNull(row.finishedAt),
});

export const toPilotProposalDto = (
  row: PilotProposalRow,
): PilotProposalDto => ({
  id: row.id,
  runId: row.runId,
  ruleType: row.ruleType as PilotProposalDto["ruleType"],
  action: row.action as PilotProposalDto["action"],
  adAccountId: row.adAccountMetaId,
  level: row.objectLevel as PilotProposalDto["level"],
  objectId: row.objectMetaId,
  objectName: row.objectName,
  evidence: JSON.parse(row.evidence),
  currentBudgetMinor: row.currentBudgetMinor,
  proposedBudgetMinor: row.proposedBudgetMinor,
  percent: row.percent,
  explanation: row.explanation,
  status: row.status as PilotProposalDto["status"],
  resultMessage: row.resultMessage,
  launchId: row.launchId,
  decidedAt: toIsoOrNull(row.decidedAt),
  expiresAt: iso(row.expiresAt),
  createdAt: iso(row.createdAt),
});
